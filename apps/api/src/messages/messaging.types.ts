export type OutboundChannel = 'SMS' | 'WHATSAPP';

/**
 * Message.deliveryStatus values written by the messaging layer.
 * - PENDING: row reserved (idempotency) but the provider call has not finished.
 * - NOT_SENT_CONSOLE: MESSAGING_PROVIDER=console — logged only, never delivered.
 * - QUEUED / SENT / DELIVERED / READ: accepted by Twilio and progressed via status callbacks.
 * - FAILED / UNDELIVERED: rejected by the provider, or invalid / unconfigured.
 * - RECEIVED: inbound message from a patient.
 */
export const DeliveryStatus = {
  PENDING: 'PENDING',
  NOT_SENT_CONSOLE: 'NOT_SENT_CONSOLE',
  QUEUED: 'QUEUED',
  SENT: 'SENT',
  DELIVERED: 'DELIVERED',
  READ: 'READ',
  FAILED: 'FAILED',
  UNDELIVERED: 'UNDELIVERED',
  RECEIVED: 'RECEIVED',
} as const;
export type DeliveryStatusValue = (typeof DeliveryStatus)[keyof typeof DeliveryStatus];

/** Statuses meaning the provider accepted the message. */
export const ACCEPTED_STATUSES: string[] = [
  DeliveryStatus.QUEUED,
  DeliveryStatus.SENT,
  DeliveryStatus.DELIVERED,
  DeliveryStatus.READ,
];

export interface DriverSendInput {
  channel: OutboundChannel;
  /** E.164 recipient, e.g. +919876543210 */
  to: string;
  body: string;
  /** Twilio Content API template (WhatsApp pre-approved template). */
  contentSid?: string;
  contentVariables?: Record<string, string>;
}

export interface DriverSendResult {
  deliveryStatus: DeliveryStatusValue;
  externalId?: string | null;
  providerStatus?: string | null;
  errorMessage?: string | null;
}

export interface MessagingDriver {
  readonly name: 'console' | 'twilio';
  isChannelConfigured(channel: OutboundChannel): boolean;
  send(input: DriverSendInput): Promise<DriverSendResult>;
}

/** Maps a Twilio MessageStatus to our deliveryStatus. */
export function mapTwilioStatus(status: string | undefined | null): DeliveryStatusValue {
  switch ((status || '').toLowerCase()) {
    case 'accepted':
    case 'scheduled':
    case 'queued':
      return DeliveryStatus.QUEUED;
    case 'sending':
    case 'sent':
      return DeliveryStatus.SENT;
    case 'delivered':
      return DeliveryStatus.DELIVERED;
    case 'read':
      return DeliveryStatus.READ;
    case 'undelivered':
      return DeliveryStatus.UNDELIVERED;
    case 'received':
    case 'receiving':
      return DeliveryStatus.RECEIVED;
    case 'failed':
    case 'canceled':
    default:
      return DeliveryStatus.FAILED;
  }
}

const RANK: Record<string, number> = {
  PENDING: 0,
  QUEUED: 1,
  SENT: 2,
  DELIVERED: 3,
  READ: 4,
  FAILED: 5,
  UNDELIVERED: 5,
};

/** Status callbacks can arrive out of order; never move a message backwards. */
export function shouldApplyStatus(current: string | null | undefined, next: string): boolean {
  const c = RANK[current ?? 'PENDING'] ?? 0;
  const n = RANK[next] ?? 0;
  if (c === 5) return false; // terminal failure
  return n >= c;
}
