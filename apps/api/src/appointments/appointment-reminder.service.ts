import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MessagingService } from '../messages/messaging.service';
import { MessageContextService } from '../messages/message-context.service';
import { TemplatePurpose, contentVariablesFor, renderTemplate } from '../messages/template-render';
import { ACCEPTED_STATUSES } from '../messages/messaging.types';

export interface AutomationCounts {
  candidates: number;
  sent: number;
  failed: number;
  skipped: number;
}

const ACTIVE = ['SCHEDULED', 'CONFIRMED'] as const;
const HOUR = 3_600_000;
const MAX_PER_RUN = 2000;

/**
 * Appointment automations. Idempotent through Message.reminderKey:
 *   confirm:<apptId>   booking confirmation (appointments created in the last 24h, still upcoming)
 *   cancel:<apptId>    cancellation notice (cancelled in the last 24h, was upcoming)
 *   remind24:<apptId>  ~24h reminder (start within 2–24h, booked at least 12h before start)
 *   remind2:<apptId>   ~2h reminder (start within 2h, booked at least 3h before start)
 * Windows are cumulative, so a run that is late or skipped still sends on the next run.
 */
@Injectable()
export class AppointmentReminderService {
  private readonly logger = new Logger(AppointmentReminderService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly messaging: MessagingService,
    private readonly context: MessageContextService,
  ) {}

  private async process(
    where: Prisma.AppointmentWhereInput,
    keyPrefix: string,
    purpose: string,
    filter?: (a: { scheduledStart: Date; createdAt: Date }) => boolean,
  ): Promise<AutomationCounts> {
    const rows = await this.prisma.appointment.findMany({
      where: { deletedAt: null, ...where },
      select: { id: true, organizationId: true, branchId: true, patientId: true, scheduledStart: true, createdAt: true },
      orderBy: { scheduledStart: 'asc' },
      take: MAX_PER_RUN,
    });
    const candidates = filter ? rows.filter(filter) : rows;
    const counts: AutomationCounts = { candidates: candidates.length, sent: 0, failed: 0, skipped: 0 };
    if (!candidates.length) return counts;
    const done = new Set(
      (
        await this.prisma.message.findMany({
          where: { reminderKey: { in: candidates.map((a) => `${keyPrefix}${a.id}`) } },
          select: { reminderKey: true },
        })
      ).map((m) => m.reminderKey),
    );
    for (const appt of candidates) {
      const key = `${keyPrefix}${appt.id}`;
      if (done.has(key)) {
        counts.skipped++;
        continue;
      }
      try {
        const patient = await this.prisma.patient.findFirst({
          where: { id: appt.patientId, organizationId: appt.organizationId },
          select: { preferredChannel: true },
        });
        const channel = this.messaging.resolveChannel(patient?.preferredChannel ?? null);
        const tpl = await this.context.resolveTemplate(appt.organizationId, purpose, channel);
        if (!tpl) continue;
        const vars = await this.context.varsForPatient(appt.organizationId, appt.patientId, { appointmentId: appt.id });
        const out = await this.messaging.sendToPatient({
          organizationId: appt.organizationId,
          branchId: appt.branchId,
          patientId: appt.patientId,
          channel,
          body: renderTemplate(tpl.content, vars),
          reminderKey: key,
          essential: true,
          contentSid: channel === 'WHATSAPP' ? tpl.externalTemplateId : null,
          contentVariables: channel === 'WHATSAPP' && tpl.externalTemplateId ? contentVariablesFor(tpl.content, vars) : undefined,
        });
        if (!out.message) counts.skipped++;
        else if (ACCEPTED_STATUSES.includes(out.message.deliveryStatus ?? '')) counts.sent++;
        else counts.failed++;
      } catch (err) {
        counts.failed++;
        this.logger.error(`${keyPrefix} failed for appointment ${appt.id}: ${(err as Error).message}`);
      }
    }
    return counts;
  }

  async sendBookingConfirmations(organizationId?: string) {
    const now = new Date();
    return this.process(
      {
        ...(organizationId ? { organizationId } : {}),
        status: { in: [...ACTIVE] },
        createdAt: { gte: new Date(now.getTime() - 24 * HOUR) },
        scheduledStart: { gt: now },
      },
      'confirm:',
      TemplatePurpose.APPOINTMENT_CONFIRMATION,
    );
  }

  async sendCancellationNotices(organizationId?: string) {
    const now = new Date();
    return this.process(
      {
        ...(organizationId ? { organizationId } : {}),
        status: 'CANCELLED',
        updatedAt: { gte: new Date(now.getTime() - 24 * HOUR) },
        scheduledStart: { gt: now },
      },
      'cancel:',
      TemplatePurpose.APPOINTMENT_CANCELLED,
    );
  }

  /** Reminders for appointments starting within `hoursBefore` hours (24 or 2). */
  async sendAppointmentReminders(hoursBefore: number, organizationId?: string) {
    const now = Date.now();
    const is24 = hoursBefore >= 24;
    const from = new Date(now + (is24 ? 2 * HOUR : 0));
    const to = new Date(now + hoursBefore * HOUR);
    const minLead = (is24 ? 12 : 3) * HOUR;
    return this.process(
      {
        ...(organizationId ? { organizationId } : {}),
        status: { in: [...ACTIVE] },
        scheduledStart: { gt: from, lte: to },
      },
      is24 ? 'remind24:' : 'remind2:',
      is24 ? TemplatePurpose.APPOINTMENT_REMINDER_24H : TemplatePurpose.APPOINTMENT_REMINDER_2H,
      // Skip reminders for last-minute bookings; the booking confirmation covers them.
      (a) => a.scheduledStart.getTime() - a.createdAt.getTime() >= minLead,
    );
  }

  async send24HourReminders(organizationId?: string) {
    return this.sendAppointmentReminders(24, organizationId);
  }

  async send2HourReminders(organizationId?: string) {
    return this.sendAppointmentReminders(2, organizationId);
  }
}
