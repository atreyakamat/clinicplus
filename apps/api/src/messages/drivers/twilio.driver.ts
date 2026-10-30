import { Logger } from '@nestjs/common';
import axios from 'axios';
import { DeliveryStatus, DriverSendInput, DriverSendResult, MessagingDriver, OutboundChannel, mapTwilioStatus } from '../messaging.types';
import { maskPhone } from '../phone.util';

export interface TwilioConfig {
  accountSid: string;
  authToken: string;
  smsFrom?: string | null;
  whatsappFrom?: string | null;
  /** Full status callback URL, or null when API_PUBLIC_URL is not set. */
  statusCallbackUrl?: string | null;
  timeoutMs?: number;
}

export const TWILIO_API_BASE = 'https://api.twilio.com/2010-04-01';

/** "whatsapp:+1415..." or "+1415..." → "whatsapp:+1415..." */
export function toWhatsAppAddress(numberOrAddress: string): string {
  const v = numberOrAddress.trim();
  return v.toLowerCase().startsWith('whatsapp:') ? `whatsapp:${v.slice('whatsapp:'.length)}` : `whatsapp:${v}`;
}

/**
 * Twilio Programmable Messaging over the REST API (no SDK dependency).
 * POST /Accounts/{SID}/Messages.json, HTTP basic auth, form-encoded body.
 */
export class TwilioMessagingDriver implements MessagingDriver {
  readonly name = 'twilio' as const;
  private readonly logger = new Logger('MessagingTwilioDriver');

  constructor(private readonly cfg: TwilioConfig) {}

  isChannelConfigured(channel: OutboundChannel): boolean {
    return channel === 'WHATSAPP' ? !!this.cfg.whatsappFrom : !!this.cfg.smsFrom;
  }

  async send(input: DriverSendInput): Promise<DriverSendResult> {
    if (!this.isChannelConfigured(input.channel)) {
      return {
        deliveryStatus: DeliveryStatus.FAILED,
        providerStatus: 'not_configured',
        errorMessage: `${input.channel} sender is not configured (set ${input.channel === 'WHATSAPP' ? 'TWILIO_WHATSAPP_FROM' : 'TWILIO_SMS_FROM'})`,
      };
    }
    const isWa = input.channel === 'WHATSAPP';
    const form = new URLSearchParams();
    form.set('To', isWa ? toWhatsAppAddress(input.to) : input.to);
    form.set('From', isWa ? toWhatsAppAddress(this.cfg.whatsappFrom!) : this.cfg.smsFrom!);
    if (isWa && input.contentSid) {
      form.set('ContentSid', input.contentSid);
      if (input.contentVariables) form.set('ContentVariables', JSON.stringify(input.contentVariables));
    } else {
      form.set('Body', input.body);
    }
    if (this.cfg.statusCallbackUrl) form.set('StatusCallback', this.cfg.statusCallbackUrl);

    const url = `${TWILIO_API_BASE}/Accounts/${encodeURIComponent(this.cfg.accountSid)}/Messages.json`;
    try {
      const res = await axios.post(url, form.toString(), {
        auth: { username: this.cfg.accountSid, password: this.cfg.authToken },
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: this.cfg.timeoutMs ?? 15_000,
      });
      const data = res.data ?? {};
      const status = mapTwilioStatus(data.status);
      return {
        deliveryStatus: status === DeliveryStatus.RECEIVED ? DeliveryStatus.QUEUED : status,
        externalId: data.sid ?? null,
        providerStatus: data.status ?? null,
        errorMessage: data.error_message ?? (data.error_code ? `Twilio error ${data.error_code}` : null),
      };
    } catch (err: any) {
      const data = err?.response?.data;
      const message = data?.message
        ? `Twilio ${data.code ?? err.response?.status}: ${data.message}`
        : `Twilio request failed: ${err?.message ?? 'unknown error'}`;
      this.logger.warn(`${input.channel} to ${maskPhone(input.to)} failed: ${message}`);
      return {
        deliveryStatus: DeliveryStatus.FAILED,
        providerStatus: data?.code ? String(data.code) : 'request_error',
        errorMessage: message.slice(0, 1000),
      };
    }
  }
}
