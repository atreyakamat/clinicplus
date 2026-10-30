import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { DeliveryStatus, mapTwilioStatus, shouldApplyStatus } from './messaging.types';
import { normalizePhoneE164, phoneLookupCandidates } from './phone.util';
import { verifyTwilioSignature } from './twilio-signature';

export const OPT_OUT_KEYWORDS = ['STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT', 'OPTOUT'];
export const OPT_IN_KEYWORDS = ['START', 'UNSTOP', 'SUBSCRIBE', 'OPTIN'];

type Params = Record<string, any>;

@Injectable()
export class TwilioWebhookService {
  private readonly logger = new Logger(TwilioWebhookService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Rejects (403) any request whose X-Twilio-Signature does not match. The signed URL is built
   * from API_PUBLIC_URL (what Twilio was told to call) — falling back to the request's own
   * protocol/host when API_PUBLIC_URL is unset. Without TWILIO_AUTH_TOKEN nothing is accepted.
   */
  assertSignature(originalUrl: string, fallbackOrigin: string, params: Params, signature: string | undefined) {
    const token = this.config.get<string>('TWILIO_AUTH_TOKEN');
    if (!token) throw new ForbiddenException('Twilio webhooks are not configured (TWILIO_AUTH_TOKEN missing)');
    const base = (this.config.get<string>('API_PUBLIC_URL') || fallbackOrigin).replace(/\/+$/, '');
    if (!verifyTwilioSignature(token, base + originalUrl, params, signature)) {
      throw new ForbiddenException('Invalid Twilio signature');
    }
  }

  /** Returns false when this event was already processed (idempotency via WebhookEvent). */
  private async claimEvent(eventId: string, eventType: string, payload: Params, organizationId: string | null = null) {
    try {
      const row = await this.prisma.webhookEvent.create({
        data: { provider: 'twilio', eventId, eventType, payload: redactPayload(payload), organizationId },
      });
      return row.id;
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') return null;
      throw err;
    }
  }

  private async finishEvent(id: string, organizationId: string | null, error?: string | null) {
    await this.prisma.webhookEvent.update({
      where: { id },
      data: { processedAt: new Date(), error: error ?? null, ...(organizationId ? { organizationId } : {}) },
    });
  }

  /** Delivery status callback → updates the Message by its Twilio SID. */
  async handleStatus(params: Params) {
    const sid: string | undefined = params.MessageSid || params.SmsSid;
    const status: string | undefined = params.MessageStatus || params.SmsStatus;
    if (!sid || !status) return { ok: true, ignored: 'missing MessageSid/MessageStatus' };
    const eventId = await this.claimEvent(`${sid}:${status}`, `status.${status}`, params);
    if (!eventId) return { ok: true, duplicate: true };

    const message = await this.prisma.message.findFirst({ where: { externalId: sid } });
    if (!message) {
      await this.finishEvent(eventId, null, 'message not found');
      return { ok: true, ignored: 'unknown message' };
    }
    const next = mapTwilioStatus(status);
    const errorText = params.ErrorCode ? `Twilio ${params.ErrorCode}${params.ErrorMessage ? `: ${params.ErrorMessage}` : ''}` : null;
    if (shouldApplyStatus(message.deliveryStatus, next)) {
      await this.prisma.message.update({
        where: { id: message.id },
        data: { deliveryStatus: next, providerStatus: status, ...(errorText ? { errorMessage: errorText.slice(0, 1000) } : {}) },
      });
    }
    await this.finishEvent(eventId, message.organizationId);
    return { ok: true };
  }

  /**
   * Inbound message from a patient.
   *
   * Single shared Twilio number: the sender is matched to patients by phone. When the same
   * number is a patient in several clinics, the conversation is attributed to the clinic that
   * most recently messaged that number (the latest OUTBOUND message). If no clinic ever
   * messaged it and the match is ambiguous, the message is not stored (logged on the WebhookEvent).
   *
   * STOP / START keywords set Patient.communicationOptIn for every patient record with that
   * number (the opt-out applies to the shared sender, as Twilio itself enforces).
   */
  async handleInbound(params: Params) {
    const sid: string | undefined = params.MessageSid || params.SmsSid;
    const from = normalizePhoneE164(params.From);
    const body = String(params.Body ?? '').slice(0, 4000);
    if (!sid || !from) return { ok: true, ignored: 'missing MessageSid/From' };
    const eventId = await this.claimEvent(`${sid}:inbound`, 'inbound', params);
    if (!eventId) return { ok: true, duplicate: true };

    const channel = String(params.From).toLowerCase().startsWith('whatsapp:') ? 'WHATSAPP' : 'SMS';
    const patients = await this.prisma.patient.findMany({
      where: { phone: { in: phoneLookupCandidates(from) }, deletedAt: null },
      select: { id: true, organizationId: true, branchId: true },
    });
    if (!patients.length) {
      await this.finishEvent(eventId, null, 'no patient matches sender');
      return { ok: true, matched: false };
    }

    const keyword = body.trim().toUpperCase().replace(/[^A-Z]/g, '');
    let optChange: boolean | null = null;
    if (OPT_OUT_KEYWORDS.includes(keyword)) optChange = false;
    else if (OPT_IN_KEYWORDS.includes(keyword)) optChange = true;
    if (optChange !== null) {
      await this.prisma.patient.updateMany({
        where: { id: { in: patients.map((p) => p.id) } },
        data: { communicationOptIn: optChange },
      });
    }

    let target = patients.length === 1 ? patients[0] : null;
    const lastOutbound = await this.prisma.message.findFirst({
      where: { patientId: { in: patients.map((p) => p.id) }, direction: 'OUTBOUND' },
      orderBy: { createdAt: 'desc' },
      select: { patientId: true },
    });
    if (lastOutbound) target = patients.find((p) => p.id === lastOutbound.patientId) ?? target;
    if (!target) {
      await this.finishEvent(eventId, null, `ambiguous sender: ${patients.length} patients, no prior outbound message`);
      return { ok: true, matched: false, ambiguous: true };
    }

    await this.prisma.message.create({
      data: {
        organizationId: target.organizationId,
        branchId: target.branchId,
        patientId: target.id,
        channel,
        direction: 'INBOUND',
        messageBody: body || (Number(params.NumMedia) > 0 ? '[media message]' : ''),
        deliveryStatus: DeliveryStatus.RECEIVED,
        externalId: sid,
        providerStatus: 'received',
      },
    });
    await this.finishEvent(eventId, target.organizationId);
    return { ok: true, matched: true, optChange };
  }
}

/** Keeps webhook audit rows free of message text (PHI) — only routing metadata. */
function redactPayload(p: Params): Prisma.InputJsonValue {
  const keep = ['MessageSid', 'SmsSid', 'MessageStatus', 'SmsStatus', 'ErrorCode', 'ErrorMessage', 'AccountSid', 'NumMedia', 'To'];
  const out: Record<string, string> = {};
  for (const k of keep) if (p[k] !== undefined) out[k] = String(p[k]);
  if (p.From) out.From = String(p.From).replace(/\d(?=\d{2})/g, '*');
  return out;
}
