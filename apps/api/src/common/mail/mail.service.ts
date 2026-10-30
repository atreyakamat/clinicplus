import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';

export interface OutboundMail {
  to: string;
  subject: string;
  text: string;
}

export interface MailResult {
  delivered: boolean;
  provider: string;
  error?: string;
}

type MailProvider = 'console' | 'resend' | 'sendgrid';

/**
 * Transactional e-mail (password reset, staff invitations).
 *
 * Providers (selected with MAIL_PROVIDER, read straight from the environment):
 * - `resend`   : https://resend.com HTTP API (MAIL_API_KEY, MAIL_FROM)
 * - `sendgrid` : SendGrid v3 HTTP API (MAIL_API_KEY, MAIL_FROM)
 * - `console`  : default. Nothing is sent and `delivered: false` is returned so
 *                callers never claim delivery. Outside production the message
 *                body is logged so links can be used during development.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly provider: MailProvider;
  private readonly apiKey?: string;
  private readonly from?: string;

  constructor() {
    const requested = (process.env.MAIL_PROVIDER || 'console').toLowerCase();
    this.apiKey = process.env.MAIL_API_KEY || undefined;
    this.from = process.env.MAIL_FROM || undefined;
    if ((requested === 'resend' || requested === 'sendgrid') && this.apiKey && this.from) {
      this.provider = requested;
    } else {
      if (requested !== 'console') {
        this.logger.error(`MAIL_PROVIDER=${requested} requires MAIL_API_KEY and MAIL_FROM; falling back to console (nothing is sent)`);
      }
      this.provider = 'console';
    }
  }

  get configured() {
    return this.provider !== 'console';
  }

  get providerName() {
    return this.provider;
  }

  async send(mail: OutboundMail): Promise<MailResult> {
    if (this.provider === 'console') {
      this.logger.warn(`E-mail provider not configured; NOT sent -> to=${mail.to} subject="${mail.subject}"`);
      if (process.env.NODE_ENV !== 'production') {
        this.logger.log(`[dev mail body] ${mail.text}`);
      }
      return { delivered: false, provider: 'console', error: 'E-mail provider not configured' };
    }
    try {
      if (this.provider === 'resend') {
        await axios.post(
          'https://api.resend.com/emails',
          { from: this.from, to: [mail.to], subject: mail.subject, text: mail.text },
          { headers: { Authorization: `Bearer ${this.apiKey}` }, timeout: 10_000 },
        );
      } else {
        await axios.post(
          'https://api.sendgrid.com/v3/mail/send',
          {
            personalizations: [{ to: [{ email: mail.to }] }],
            from: { email: this.from },
            subject: mail.subject,
            content: [{ type: 'text/plain', value: mail.text }],
          },
          { headers: { Authorization: `Bearer ${this.apiKey}` }, timeout: 10_000 },
        );
      }
      return { delivered: true, provider: this.provider };
    } catch (err: any) {
      const detail = err?.response?.status ? `HTTP ${err.response.status}` : err?.message;
      this.logger.error(`E-mail delivery via ${this.provider} failed for ${mail.to}: ${detail}`);
      return { delivered: false, provider: this.provider, error: `Delivery failed (${detail})` };
    }
  }
}
