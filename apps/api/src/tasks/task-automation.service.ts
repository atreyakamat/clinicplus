import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, TaskPriority } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { IntervalJob, LOCK_IDS, schedulerEnabled, withJobLock } from './scheduler-lock';

type Db = PrismaService | Prisma.TransactionClient;

/** Task.sourceType values for automatically created tasks. */
export const TASK_SOURCE = {
  MANUAL: 'MANUAL',
  WORKFLOW: 'WORKFLOW',
  FOLLOW_UP_MISSED: 'FOLLOW_UP_MISSED',
  INVOICE_OVERDUE: 'INVOICE_OVERDUE',
} as const;

const FRONT_DESK_ROLES = ['Receptionist', 'Branch Manager'];
const COLLECTION_ROLES = ['Accountant', 'Receptionist', 'Branch Manager'];

/**
 * Creates tasks from clinic events. Every automatic task carries
 * (sourceType, sourceId) and is created at most once per source, so the scan
 * can run repeatedly (and from several replicas, guarded by an advisory lock).
 */
@Injectable()
export class TaskAutomationService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(TaskAutomationService.name);
  private readonly job = new IntervalJob('task automation scan', 15 * 60_000, () => this.runScan(), this.logger);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  onApplicationBootstrap() {
    if (schedulerEnabled(this.config)) this.job.start();
  }

  onApplicationShutdown() {
    this.job.stop();
  }

  /**
   * First active user of the branch holding one of `roleNames` (in preference
   * order) whose role also grants tasks.view, so the assignee can actually see
   * the task. Falls back to the same role elsewhere in the organization.
   */
  async findUserForRoles(db: Db, organizationId: string, branchId: string, roleNames: string[]) {
    for (const branchScoped of [true, false]) {
      for (const name of roleNames) {
        const user = await db.user.findFirst({
          where: {
            organizationId,
            ...(branchScoped ? { branchId } : {}),
            status: 'ACTIVE',
            deletedAt: null,
            roles: {
              some: {
                role: {
                  name: { equals: name, mode: 'insensitive' },
                  organizationId,
                  rolePermissions: { some: { permission: { module: 'tasks', action: 'view' } } },
                },
              },
            },
          },
          orderBy: { createdAt: 'asc' },
          select: { id: true, firstName: true, lastName: true },
        });
        if (user) return user;
      }
    }
    return null;
  }

  /** Creates the task unless one already exists for (sourceType, sourceId). Returns null when it existed. */
  async ensureSourceTask(
    db: Db,
    data: {
      organizationId: string;
      branchId: string;
      sourceType: string;
      sourceId: string;
      title: string;
      description?: string;
      patientId?: string | null;
      assignedTo?: string | null;
      priority?: TaskPriority;
      dueDate?: Date | null;
    },
  ) {
    const existing = await db.task.findFirst({
      where: { organizationId: data.organizationId, sourceType: data.sourceType, sourceId: data.sourceId },
      select: { id: true },
    });
    if (existing) return null;
    return db.task.create({
      data: {
        organizationId: data.organizationId,
        branchId: data.branchId,
        sourceType: data.sourceType,
        sourceId: data.sourceId,
        title: data.title,
        description: data.description,
        patientId: data.patientId ?? null,
        assignedTo: data.assignedTo ?? null,
        priority: data.priority ?? 'MEDIUM',
        dueDate: data.dueDate ?? null,
      },
    });
  }

  /** "Call the patient" task for a missed follow-up, assigned to the front desk. */
  async ensureMissedFollowUpTask(
    db: Db,
    followUp: {
      id: string;
      organizationId: string;
      branchId: string;
      patientId: string;
      scheduledDate: Date;
      reason?: string | null;
      patient?: { firstName: string; lastName: string; phone: string | null } | null;
    },
  ) {
    const assignee = await this.findUserForRoles(db, followUp.organizationId, followUp.branchId, FRONT_DESK_ROLES);
    const name = followUp.patient ? `${followUp.patient.firstName} ${followUp.patient.lastName}` : 'patient';
    const due = new Date();
    due.setHours(due.getHours() + 24);
    return this.ensureSourceTask(db, {
      organizationId: followUp.organizationId,
      branchId: followUp.branchId,
      sourceType: TASK_SOURCE.FOLLOW_UP_MISSED,
      sourceId: followUp.id,
      title: `Call ${name} — missed follow-up`,
      description: [
        `Follow-up due ${followUp.scheduledDate.toISOString().slice(0, 10)} was missed.`,
        followUp.reason ? `Reason: ${followUp.reason}` : null,
        followUp.patient?.phone ? `Phone: ${followUp.patient.phone}` : null,
        'Call the patient and book a new appointment, then record the outcome on the follow-up.',
      ]
        .filter(Boolean)
        .join('\n'),
      patientId: followUp.patientId,
      assignedTo: assignee?.id ?? null,
      priority: 'HIGH',
      dueDate: due,
    });
  }

  /** One scan over all tenants (or one, for tests / manual triggering). */
  async runScan(now = new Date(), organizationId?: string) {
    const orgFilter = organizationId ?? null;
    const result = await withJobLock(this.prisma, LOCK_IDS.taskAutomation, async (tx) => {
      let missedFollowUps = 0;
      let overdueInvoices = 0;

      // 1) Missed follow-ups without a call task (covers manual MISSED updates too).
      const missedIds = await tx.$queryRaw<{ id: string }[]>`
        SELECT f.id FROM follow_ups f
        WHERE f.status = 'MISSED'
          AND (${orgFilter}::uuid IS NULL OR f.organization_id = ${orgFilter}::uuid)
          AND NOT EXISTS (SELECT 1 FROM tasks t WHERE t.source_type = ${TASK_SOURCE.FOLLOW_UP_MISSED} AND t.source_id = f.id)
        LIMIT 500`;
      const missed = await tx.followUp.findMany({
        where: { id: { in: missedIds.map((r) => r.id) } },
        include: { patient: { select: { firstName: true, lastName: true, phone: true } } },
        orderBy: { scheduledDate: 'asc' },
        take: 500,
      });
      for (const fu of missed) {
        if (await this.ensureMissedFollowUpTask(tx, fu)) missedFollowUps++;
      }

      // 2) Overdue invoices -> collection task.
      const invoiceIds = await tx.$queryRaw<{ id: string }[]>`
        SELECT i.id FROM invoices i
        WHERE i.deleted_at IS NULL
          AND (${orgFilter}::uuid IS NULL OR i.organization_id = ${orgFilter}::uuid)
          AND (i.status = 'OVERDUE' OR (i.status IN ('SENT', 'PARTIALLY_PAID') AND i.due_date < ${now}))
          AND NOT EXISTS (SELECT 1 FROM tasks t WHERE t.source_type = ${TASK_SOURCE.INVOICE_OVERDUE} AND t.source_id = i.id)
        LIMIT 500`;
      const invoices = await tx.invoice.findMany({
        where: { id: { in: invoiceIds.map((r) => r.id) } },
        include: { patient: { select: { firstName: true, lastName: true, phone: true } } },
        orderBy: { dueDate: 'asc' },
        take: 500,
      });
      for (const inv of invoices) {
        const assignee = await this.findUserForRoles(tx, inv.organizationId, inv.branchId, COLLECTION_ROLES);
        const created = await this.ensureSourceTask(tx, {
          organizationId: inv.organizationId,
          branchId: inv.branchId,
          sourceType: TASK_SOURCE.INVOICE_OVERDUE,
          sourceId: inv.id,
          title: `Collect payment — invoice ${inv.invoiceNumber}`,
          description: [
            `Invoice ${inv.invoiceNumber} for ${inv.patient.firstName} ${inv.patient.lastName} is overdue.`,
            `Total: ${inv.total.toString()}`,
            inv.dueDate ? `Due date: ${inv.dueDate.toISOString().slice(0, 10)}` : null,
            inv.patient.phone ? `Phone: ${inv.patient.phone}` : null,
          ]
            .filter(Boolean)
            .join('\n'),
          patientId: inv.patientId,
          assignedTo: assignee?.id ?? null,
          priority: 'HIGH',
          dueDate: new Date(now.getTime() + 2 * 24 * 3600_000),
        });
        if (created) overdueInvoices++;
      }
      return { missedFollowUps, overdueInvoices };
    });
    if (result && (result.missedFollowUps || result.overdueInvoices)) {
      this.logger.log(
        `Created ${result.missedFollowUps} missed-follow-up task(s), ${result.overdueInvoices} collection task(s)`,
      );
    }
    return result ?? { skipped: true as const };
  }
}
