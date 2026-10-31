import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { TaskAutomationService } from '../tasks/task-automation.service';
import { IntervalJob, LOCK_IDS, schedulerEnabled, withJobLock } from '../tasks/scheduler-lock';
import { FOLLOW_UP_MISSED_GRACE_HOURS, FOLLOW_UP_STATUS } from './follow-up.constants';

const BATCH = 500;

/**
 * Background compliance pass over open follow-ups (all tenants):
 *  1. links a PENDING follow-up to the patient's next booked appointment (=> SCHEDULED);
 *  2. closes SCHEDULED follow-ups from their appointment: COMPLETED -> COMPLETED,
 *     NO_SHOW -> MISSED, CANCELLED -> back to PENDING (unlinked);
 *  3. marks follow-ups still open `FOLLOW_UP_MISSED_GRACE_HOURS` after their date
 *     as MISSED and creates a "call the patient" task for the front desk.
 */
@Injectable()
export class FollowUpComplianceService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(FollowUpComplianceService.name);
  private readonly job = new IntervalJob('follow-up compliance', 15 * 60_000, () => this.runOnce(), this.logger);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly automation: TaskAutomationService,
  ) {}

  onApplicationBootstrap() {
    if (schedulerEnabled(this.config)) this.job.start();
  }

  onApplicationShutdown() {
    this.job.stop();
  }

  async runOnce(now = new Date(), organizationId?: string) {
    const graceCutoff = new Date(now.getTime() - FOLLOW_UP_MISSED_GRACE_HOURS * 3600_000);
    const tenant = organizationId ? { organizationId } : {};

    const result = await withJobLock(this.prisma, LOCK_IDS.followUpCompliance, async (tx) => {
      let linked = 0;
      let completed = 0;
      let missed = 0;
      let reopened = 0;
      let tasks = 0;
      const missedIds: string[] = [];

      // 1) Link pending follow-ups to an appointment booked for the patient after the follow-up was planned.
      const pending = await tx.followUp.findMany({
        where: {
          ...tenant,
          appointmentId: null,
          OR: [{ status: FOLLOW_UP_STATUS.PENDING }, { status: null }],
        },
        select: { id: true, organizationId: true, patientId: true, createdAt: true, scheduledDate: true },
        take: BATCH,
      });
      for (const f of pending) {
        const appt = await tx.appointment.findFirst({
          where: {
            organizationId: f.organizationId,
            patientId: f.patientId,
            deletedAt: null,
            status: { notIn: ['CANCELLED', 'NO_SHOW'] },
            createdAt: { gte: f.createdAt },
            scheduledStart: {
              gte: new Date(f.scheduledDate.getTime() - 30 * 24 * 3600_000),
              lte: new Date(f.scheduledDate.getTime() + FOLLOW_UP_MISSED_GRACE_HOURS * 3600_000),
            },
          },
          orderBy: { scheduledStart: 'asc' },
          select: { id: true, status: true },
        });
        if (!appt) continue;
        // Skip appointments already fulfilling another follow-up.
        const taken = await tx.followUp.findFirst({ where: { appointmentId: appt.id }, select: { id: true } });
        if (taken) continue;
        await tx.followUp.update({
          where: { id: f.id },
          data: {
            appointmentId: appt.id,
            status: appt.status === 'COMPLETED' ? FOLLOW_UP_STATUS.COMPLETED : FOLLOW_UP_STATUS.SCHEDULED,
          },
        });
        if (appt.status === 'COMPLETED') completed++;
        else linked++;
      }

      // 2) Resolve scheduled follow-ups from their appointment outcome.
      const scheduled = await tx.followUp.findMany({
        where: { ...tenant, status: FOLLOW_UP_STATUS.SCHEDULED, appointmentId: { not: null } },
        select: { id: true, appointmentId: true },
        take: BATCH,
      });
      const appts = scheduled.length
        ? await tx.appointment.findMany({
            where: { id: { in: scheduled.map((f) => f.appointmentId!) } },
            select: { id: true, status: true, deletedAt: true },
          })
        : [];
      const apptById = new Map(appts.map((a) => [a.id, a]));
      for (const f of scheduled) {
        const a = apptById.get(f.appointmentId!);
        if (!a) continue;
        if (a.status === 'COMPLETED') {
          await tx.followUp.update({ where: { id: f.id }, data: { status: FOLLOW_UP_STATUS.COMPLETED } });
          completed++;
        } else if (a.status === 'NO_SHOW') {
          await tx.followUp.update({ where: { id: f.id }, data: { status: FOLLOW_UP_STATUS.MISSED } });
          missedIds.push(f.id);
          missed++;
        } else if (a.status === 'CANCELLED' || a.deletedAt) {
          await tx.followUp.update({
            where: { id: f.id },
            data: { status: FOLLOW_UP_STATUS.PENDING, appointmentId: null },
          });
          reopened++;
        }
      }

      // 3) Past-due open follow-ups without a fulfilling appointment become MISSED.
      const overdue = await tx.followUp.findMany({
        where: {
          ...tenant,
          scheduledDate: { lt: graceCutoff },
          OR: [
            { status: FOLLOW_UP_STATUS.PENDING },
            { status: null },
            { status: FOLLOW_UP_STATUS.SCHEDULED, appointmentId: null },
          ],
        },
        select: { id: true },
        take: BATCH,
      });
      if (overdue.length) {
        const res = await tx.followUp.updateMany({
          where: { id: { in: overdue.map((f) => f.id) } },
          data: { status: FOLLOW_UP_STATUS.MISSED },
        });
        missed += res.count;
        missedIds.push(...overdue.map((f) => f.id));
      }

      // Every MISSED follow-up touched in this pass gets its front-desk call task (idempotent).
      const needTasks = await tx.followUp.findMany({
        where: { id: { in: missedIds } },
        include: { patient: { select: { firstName: true, lastName: true, phone: true } } },
      });
      for (const f of needTasks) {
        if (await this.automation.ensureMissedFollowUpTask(tx, f)) tasks++;
      }
      return { linked, completed, missed, reopened, tasks };
    });

    if (result && Object.values(result).some(Boolean)) {
      this.logger.log(
        `Follow-up compliance: linked ${result.linked}, completed ${result.completed}, missed ${result.missed}, reopened ${result.reopened}, tasks ${result.tasks}`,
      );
    }
    return result ?? { skipped: true as const };
  }
}
