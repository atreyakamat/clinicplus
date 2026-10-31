import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MessagingService } from '../messages/messaging.service';
import { MessageContextService } from '../messages/message-context.service';
import { TemplatePurpose, contentVariablesFor, renderTemplate } from '../messages/template-render';
import { ACCEPTED_STATUSES } from '../messages/messaging.types';

export interface FollowUpAutomationCounts {
  candidates: number;
  sent: number;
  failed: number;
  skipped: number;
}

const DAY = 86_400_000;
/** Follow-up statuses that no longer need reminders. */
const CLOSED_STATUSES = ['COMPLETED', 'CANCELLED', 'CLOSED', 'SKIPPED', 'BOOKED'];
export const MAX_OVERDUE_REMINDERS = 3;
export const OVERDUE_REMINDER_GAP_DAYS = 3;

/**
 * Follow-up reminders (idempotent via Message.reminderKey):
 *   fu-due:<id>          follow-up due within the next 36 hours ("due tomorrow")
 *   fu-overdue:<id>:<n>  overdue follow-up, at most MAX_OVERDUE_REMINDERS, every OVERDUE_REMINDER_GAP_DAYS days
 * Follow-ups already linked to an appointment are skipped (appointment reminders cover them).
 * Updates FollowUp.reminderCount / lastRemindedAt.
 */
@Injectable()
export class FollowUpReminderService {
  private readonly logger = new Logger(FollowUpReminderService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly messaging: MessagingService,
    private readonly context: MessageContextService,
  ) {}

  private openWhere(organizationId?: string): Prisma.FollowUpWhereInput {
    return {
      ...(organizationId ? { organizationId } : {}),
      appointmentId: null,
      OR: [{ status: null }, { status: { notIn: CLOSED_STATUSES } }],
    };
  }

  private async remind(
    fu: { id: string; organizationId: string; branchId: string; patientId: string; scheduledDate: Date; reminderCount: number; doctor: { firstName: string; lastName: string } | null },
    key: string,
    counts: FollowUpAutomationCounts,
  ) {
    try {
      const patient = await this.prisma.patient.findFirst({
        where: { id: fu.patientId, organizationId: fu.organizationId },
        select: { preferredChannel: true },
      });
      const channel = this.messaging.resolveChannel(patient?.preferredChannel ?? null);
      const tpl = await this.context.resolveTemplate(fu.organizationId, TemplatePurpose.FOLLOW_UP_REMINDER, channel);
      if (!tpl) return;
      const vars = await this.context.varsForPatient(fu.organizationId, fu.patientId, { doctor: fu.doctor, date: fu.scheduledDate });
      const out = await this.messaging.sendToPatient({
        organizationId: fu.organizationId,
        branchId: fu.branchId,
        patientId: fu.patientId,
        channel,
        body: renderTemplate(tpl.content, vars),
        reminderKey: key,
        essential: true,
        contentSid: channel === 'WHATSAPP' ? tpl.externalTemplateId : null,
        contentVariables: channel === 'WHATSAPP' && tpl.externalTemplateId ? contentVariablesFor(tpl.content, vars) : undefined,
      });
      if (!out.message) {
        counts.skipped++;
        return;
      }
      await this.prisma.followUp.update({
        where: { id: fu.id },
        data: { reminderCount: { increment: 1 }, lastRemindedAt: new Date() },
      });
      if (ACCEPTED_STATUSES.includes(out.message.deliveryStatus ?? '')) counts.sent++;
      else counts.failed++;
    } catch (err) {
      counts.failed++;
      this.logger.error(`Follow-up reminder failed for ${fu.id}: ${(err as Error).message}`);
    }
  }

  private readonly select = {
    id: true,
    organizationId: true,
    branchId: true,
    patientId: true,
    scheduledDate: true,
    reminderCount: true,
    lastRemindedAt: true,
    doctor: { select: { firstName: true, lastName: true } },
  } as const;

  /** Follow-ups due within the next 36 hours. */
  async sendDueReminders(organizationId?: string): Promise<FollowUpAutomationCounts> {
    const now = Date.now();
    const rows = await this.prisma.followUp.findMany({
      where: { ...this.openWhere(organizationId), scheduledDate: { gte: new Date(now), lte: new Date(now + 1.5 * DAY) } },
      select: this.select,
      take: 1000,
    });
    const counts = { candidates: rows.length, sent: 0, failed: 0, skipped: 0 };
    const done = new Set(
      (await this.prisma.message.findMany({ where: { reminderKey: { in: rows.map((r) => `fu-due:${r.id}`) } }, select: { reminderKey: true } })).map((m) => m.reminderKey),
    );
    for (const fu of rows) {
      if (done.has(`fu-due:${fu.id}`)) {
        counts.skipped++;
        continue;
      }
      await this.remind(fu, `fu-due:${fu.id}`, counts);
    }
    return counts;
  }

  /** Overdue (scheduled date passed, still open): up to MAX_OVERDUE_REMINDERS, spaced by OVERDUE_REMINDER_GAP_DAYS. */
  async sendOverdueReminders(organizationId?: string): Promise<FollowUpAutomationCounts> {
    const now = Date.now();
    const rows = await this.prisma.followUp.findMany({
      where: {
        ...this.openWhere(organizationId),
        scheduledDate: { lt: new Date(now - 0.5 * DAY), gte: new Date(now - 60 * DAY) },
        reminderCount: { lt: MAX_OVERDUE_REMINDERS + 1 },
        AND: [{ OR: [{ lastRemindedAt: null }, { lastRemindedAt: { lte: new Date(now - OVERDUE_REMINDER_GAP_DAYS * DAY) } }] }],
      },
      select: this.select,
      take: 1000,
    });
    const counts = { candidates: rows.length, sent: 0, failed: 0, skipped: 0 };
    for (const fu of rows) {
      const n = (await this.prisma.message.count({ where: { reminderKey: { startsWith: `fu-overdue:${fu.id}:` } } })) + 1;
      if (n > MAX_OVERDUE_REMINDERS) {
        counts.skipped++;
        continue;
      }
      await this.remind(fu, `fu-overdue:${fu.id}:${n}`, counts);
    }
    return counts;
  }

  /** Back-compat: follow-ups due tomorrow. */
  async sendTomorrowFollowUpReminders(organizationId?: string) {
    return this.sendDueReminders(organizationId);
  }

  /** Back-compat: overdue follow-ups. */
  async sendTodayFollowUpReminders(organizationId?: string) {
    return this.sendOverdueReminders(organizationId);
  }

  /** Back-compat entry point. */
  async sendFollowUpReminders(daysBefore: number, organizationId?: string) {
    return daysBefore > 0 ? this.sendDueReminders(organizationId) : this.sendOverdueReminders(organizationId);
  }
}
