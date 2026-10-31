import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { OutboundChannel } from './messaging.types';
import { TemplateVars, defaultTemplateFor, formatInTimeZone } from './template-render';

export interface ResolvedTemplate {
  content: string;
  templateId: string | null;
  /** Twilio Content SID for WhatsApp pre-approved templates. */
  externalTemplateId: string | null;
}

/** Builds {{variable}} values and resolves which template text to use. */
@Injectable()
export class MessageContextService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  defaultTimezone(): string {
    return this.config.get<string>('DEFAULT_TIMEZONE') || 'Asia/Kolkata';
  }

  doctorName(d?: { firstName?: string | null; lastName?: string | null } | null): string {
    if (!d) return '';
    return `Dr. ${[d.firstName, d.lastName].filter(Boolean).join(' ')}`.trim();
  }

  /** Variables for a patient (and optionally an appointment / doctor / date). */
  async varsForPatient(
    organizationId: string,
    patientId: string,
    extra: { appointmentId?: string; doctor?: { firstName?: string | null; lastName?: string | null } | null; date?: Date | null; link?: string | null } = {},
  ): Promise<TemplateVars> {
    const patient = await this.prisma.patient.findFirst({
      where: { id: patientId, organizationId },
      select: {
        firstName: true,
        lastName: true,
        organization: { select: { name: true } },
        branch: { select: { name: true, timezone: true } },
      },
    });
    if (!patient) throw new NotFoundException('Patient not found');
    const vars: TemplateVars = {
      patientName: [patient.firstName, patient.lastName].filter(Boolean).join(' '),
      firstName: patient.firstName,
      clinicName: patient.organization?.name ?? '',
      branchName: patient.branch?.name ?? '',
      doctorName: this.doctorName(extra.doctor),
      link: extra.link ?? '',
    };
    let tz = patient.branch?.timezone || this.defaultTimezone();
    let date = extra.date ?? null;
    if (extra.appointmentId) {
      const appt = await this.prisma.appointment.findFirst({
        where: { id: extra.appointmentId, organizationId },
        select: {
          scheduledStart: true,
          doctor: { select: { firstName: true, lastName: true } },
          branch: { select: { name: true, timezone: true } },
        },
      });
      if (appt) {
        date = appt.scheduledStart;
        vars.doctorName = this.doctorName(appt.doctor);
        vars.branchName = appt.branch?.name ?? vars.branchName;
        tz = appt.branch?.timezone || tz;
      }
    }
    if (date) {
      vars.appointmentDate = formatInTimeZone(date, tz, 'date');
      vars.appointmentTime = formatInTimeZone(date, tz, 'time');
    }
    return vars;
  }

  /**
   * Active org template for a purpose, preferring the given channel; falls back to the
   * built-in default text when the clinic has none.
   */
  async resolveTemplate(organizationId: string, purpose: string, channel?: OutboundChannel | null): Promise<ResolvedTemplate | null> {
    const rows = await this.prisma.template.findMany({
      where: { organizationId, purpose, isActive: true, channel: { in: ['SMS', 'WHATSAPP'] } },
      orderBy: { updatedAt: 'desc' },
    });
    const row = rows.find((r) => r.channel === channel) ?? rows[0];
    if (row) {
      return {
        content: row.templateContent,
        templateId: row.id,
        externalTemplateId: row.channel === 'WHATSAPP' ? row.externalTemplateId : null,
      };
    }
    const def = defaultTemplateFor(purpose);
    return def ? { content: def.content, templateId: null, externalTemplateId: null } : null;
  }
}
