import { BadRequestException, Injectable } from '@nestjs/common';
import { MessagingService } from './messaging.service';

/**
 * Backwards-compatible SMS facade used by other modules (staff invitations, review requests).
 * All sending goes through MessagingService and the configured driver (console | twilio).
 */
@Injectable()
export class SmsService {
  constructor(private readonly messaging: MessagingService) {}

  /**
   * Sends an SMS to a raw phone number. No Message row is written (there is no patient).
   * `success` is true only when the provider accepted the message; with the console
   * driver it is false and `status` is NOT_SENT_CONSOLE.
   */
  async sendSms(
    to: string,
    content: string,
    _organizationId: string,
    _branchId: string,
  ): Promise<{ success: boolean; messageId?: string; error?: string; status?: string; driver?: string }> {
    if (!to || !content) {
      throw new BadRequestException('Phone number and content are required');
    }
    const res = await this.messaging.sendToNumber(to, content, 'SMS');
    const success = this.messaging.isAccepted(res.deliveryStatus);
    return {
      success,
      messageId: ('externalId' in res && res.externalId) || undefined,
      error: success ? undefined : (res.errorMessage ?? undefined),
      status: res.deliveryStatus,
      driver: this.messaging.driver.name,
    };
  }

  /**
   * Sends a message to a patient of `organizationId` and records it. Treated as non-essential:
   * patients who replied STOP are not messaged (400). Uses the patient's preferred channel.
   */
  async sendAndRecord(patientId: string, content: string, organizationId: string, branchId: string) {
    const message = await this.messaging.sendToPatientOrThrow({
      organizationId,
      branchId,
      patientId,
      body: content,
      essential: false,
    });
    return {
      ...message,
      gatewayMessageId: message.externalId ?? undefined,
      gatewayError: this.messaging.isAccepted(message.deliveryStatus) ? undefined : (message.errorMessage ?? undefined),
    };
  }
}
