import { Logger } from '@nestjs/common';
import { DeliveryStatus, DriverSendInput, DriverSendResult, MessagingDriver, OutboundChannel } from '../messaging.types';
import { maskPhone } from '../phone.util';

/**
 * Development driver: logs the message and records it as NOT_SENT_CONSOLE.
 * It never claims delivery — nothing leaves the server.
 */
export class ConsoleMessagingDriver implements MessagingDriver {
  readonly name = 'console' as const;
  private readonly logger = new Logger('MessagingConsoleDriver');

  isChannelConfigured(_channel: OutboundChannel): boolean {
    return true;
  }

  async send(input: DriverSendInput): Promise<DriverSendResult> {
    this.logger.log(
      `[console] ${input.channel} to ${maskPhone(input.to)} NOT SENT (MESSAGING_PROVIDER=console), ${input.body.length} chars`,
    );
    this.logger.debug(`[console] body: ${input.body}`);
    return {
      deliveryStatus: DeliveryStatus.NOT_SENT_CONSOLE,
      providerStatus: 'console',
      externalId: null,
      errorMessage: 'Messaging provider not configured (MESSAGING_PROVIDER=console): message logged, not delivered',
    };
  }
}
