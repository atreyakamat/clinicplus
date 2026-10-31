import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Message, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { assertUuid } from '../common/validation/uuid';
import { ConsoleMessagingDriver } from './drivers/console.driver';
import { TwilioMessagingDriver } from './drivers/twilio.driver';
import { ACCEPTED_STATUSES, DeliveryStatus, MessagingDriver, OutboundChannel } from './messaging.types';
import { normalizePhoneE164 } from './phone.util';

export const TWILIO_STATUS_WEBHOOK_PATH = '/api/v1/webhooks/twilio/status';
export const TWILIO_INBOUND_WEBHOOK_PATH = '/api/v1/webhooks/twilio/inbound';

export interface SendToPatientInput {
  organizationId: string;
  /** Defaults to the patient's branch. */
  branchId?: string | null;
  patientId: string;
  /** Explicit channel; omitted → patient preference → WhatsApp if configured → SMS. */
  channel?: OutboundChannel | null;
  body: string;
  /** Idempotency key (Message.reminderKey is unique): a second send with the same key is skipped. */
  reminderKey?: string | null;
  /**
   * Essential (transactional) messages such as appointment confirmations/reminders are sent even when
   * the patient opted out of marketing. Non-essential messages (campaigns, review requests) are skipped.
   */
  essential?: boolean;
  /** WhatsApp pre-approved Twilio Content template. */
  contentSid?: string | null;
  contentVariables?: Record<string, string>;
}

export type SkipReason = 'DUPLICATE' | 'OPTED_OUT' | 'NO_PHONE' | 'PATIENT_NOT_FOUND';

export interface SendOutcome {
  message: Message | null;
  skipped?: SkipReason;
}

@Injectable()
export class MessagingService {
  private readonly logger = new Logger(MessagingService.name);
  readonly driver: MessagingDriver;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    this.driver = this.buildDriver();
  }

  private buildDriver(): MessagingDriver {
    const provider = this.config.get<string>('MESSAGING_PROVIDER') ?? 'console';
    if (provider === 'twilio') {
      return new TwilioMessagingDriver({
        accountSid: this.config.get<string>('TWILIO_ACCOUNT_SID') ?? '',
        authToken: this.config.get<string>('TWILIO_AUTH_TOKEN') ?? '',
        smsFrom: this.config.get<string>('TWILIO_SMS_FROM') || null,
        whatsappFrom: this.config.get<string>('TWILIO_WHATSAPP_FROM') || null,
        statusCallbackUrl: this.publicUrl(TWILIO_STATUS_WEBHOOK_PATH),
      });
    }
    return new ConsoleMessagingDriver();
  }

  /** `${API_PUBLIC_URL}${path}` or null when API_PUBLIC_URL is unset. */
  publicUrl(path: string): string | null {
    const base = this.config.get<string>('API_PUBLIC_URL');
    if (!base) return null;
    return base.replace(/\/+$/, '') + path;
  }

  get whatsappConfigured(): boolean {
    return !!this.config.get<string>('TWILIO_WHATSAPP_FROM');
  }

  /** No secrets: driver name, which channels can send, webhook URLs and scheduler settings. */
  providerStatus() {
    const driver = this.driver.name;
    return {
      driver,
      delivering: driver === 'twilio',
      channels: {
        SMS: driver === 'twilio' ? this.driver.isChannelConfigured('SMS') : false,
        WHATSAPP: driver === 'twilio' ? this.driver.isChannelConfigured('WHATSAPP') : false,
      },
      defaultChannel: this.defaultChannel(),
      statusCallbackUrl: this.publicUrl(TWILIO_STATUS_WEBHOOK_PATH),
      inboundWebhookUrl: this.publicUrl(TWILIO_INBOUND_WEBHOOK_PATH),
      apiPublicUrlConfigured: !!this.config.get<string>('API_PUBLIC_URL'),
      schedulerEnabled: !!this.config.get<boolean>('SCHEDULER_ENABLED'),
      reminderIntervalMinutes: this.config.get<number>('REMINDER_INTERVAL_MINUTES') ?? 15,
      message:
        driver === 'console'
          ? 'MESSAGING_PROVIDER=console: messages are logged and recorded as NOT_SENT_CONSOLE. Nothing is delivered to patients.'
          : 'Twilio is configured: messages are delivered to patients.',
    };
  }

  defaultChannel(): OutboundChannel {
    return this.whatsappConfigured ? 'WHATSAPP' : 'SMS';
  }

  /** Channel choice: explicit → patient preference (if that channel can send) → WhatsApp if configured → SMS. */
  resolveChannel(preferred?: string | null, explicit?: OutboundChannel | null): OutboundChannel {
    if (explicit) return explicit;
    const pref = (preferred || '').toUpperCase();
    if ((pref === 'WHATSAPP' || pref === 'SMS') && this.canSend(pref)) return pref;
    const def = this.defaultChannel();
    if (this.canSend(def)) return def;
    return def === 'WHATSAPP' ? 'SMS' : 'WHATSAPP';
  }

  private canSend(channel: OutboundChannel): boolean {
    return this.driver.name === 'console' || this.driver.isChannelConfigured(channel);
  }

  /**
   * Sends a message to a patient and records it. The Message row is reserved first (with the
   * idempotency key) so concurrent schedulers can never send the same reminder twice.
   */
  async sendToPatient(input: SendToPatientInput): Promise<SendOutcome> {
    assertUuid(input.patientId, 'patientId');
    const body = (input.body ?? '').trim();
    if (!body) throw new BadRequestException('Message body is required');
    if (body.length > 1600) throw new BadRequestException('Message body must be at most 1600 characters');

    const patient = await this.prisma.patient.findFirst({
      where: { id: input.patientId, organizationId: input.organizationId, deletedAt: null },
      select: { id: true, branchId: true, phone: true, communicationOptIn: true, preferredChannel: true },
    });
    if (!patient) return { message: null, skipped: 'PATIENT_NOT_FOUND' };
    if (!input.essential && patient.communicationOptIn === false) return { message: null, skipped: 'OPTED_OUT' };
    if (!patient.phone) return { message: null, skipped: 'NO_PHONE' };

    const channel = this.resolveChannel(patient.preferredChannel, input.channel ?? null);
    const to = normalizePhoneE164(patient.phone);

    let row: Message;
    try {
      row = await this.prisma.message.create({
        data: {
          organizationId: input.organizationId,
          branchId: input.branchId || patient.branchId,
          patientId: patient.id,
          channel,
          direction: 'OUTBOUND',
          messageBody: body,
          deliveryStatus: to ? DeliveryStatus.PENDING : DeliveryStatus.FAILED,
          errorMessage: to ? null : `Invalid phone number "${patient.phone}"`,
          providerStatus: to ? null : 'invalid_phone',
          reminderKey: input.reminderKey ?? null,
        },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        return { message: null, skipped: 'DUPLICATE' };
      }
      throw err;
    }
    if (!to) return { message: row };

    const result = await this.driver.send({
      channel,
      to,
      body,
      contentSid: input.contentSid ?? undefined,
      contentVariables: input.contentVariables,
    });
    const updated = await this.prisma.message.update({
      where: { id: row.id },
      data: {
        deliveryStatus: result.deliveryStatus,
        externalId: result.externalId ?? null,
        providerStatus: result.providerStatus ?? null,
        errorMessage: result.errorMessage ?? null,
        sentAt: new Date(),
      },
    });
    return { message: updated };
  }

  /** Like sendToPatient but throws for skips — for interactive (staff-initiated) sends. */
  async sendToPatientOrThrow(input: SendToPatientInput): Promise<Message> {
    const out = await this.sendToPatient(input);
    if (out.message) return out.message;
    switch (out.skipped) {
      case 'PATIENT_NOT_FOUND':
        throw new NotFoundException('Patient not found');
      case 'OPTED_OUT':
        throw new BadRequestException('Patient has opted out of messages (replied STOP)');
      case 'NO_PHONE':
        throw new BadRequestException('Patient phone number not found');
      default:
        throw new BadRequestException('Message was already sent');
    }
  }

  /** Sends to an arbitrary number without a Message row (e.g. staff invitations). */
  async sendToNumber(rawTo: string, body: string, channel: OutboundChannel = 'SMS') {
    const to = normalizePhoneE164(rawTo);
    if (!to) {
      return { deliveryStatus: DeliveryStatus.FAILED, errorMessage: `Invalid phone number "${rawTo}"` } as const;
    }
    return this.driver.send({ channel: this.canSend(channel) ? channel : this.resolveChannel(null), to, body });
  }

  isAccepted(status: string | null | undefined): boolean {
    return !!status && ACCEPTED_STATUSES.includes(status);
  }
}
