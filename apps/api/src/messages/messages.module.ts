import { Module } from '@nestjs/common';
import { MessagesController } from './messages.controller';
import { MessagesService } from './messages.service';
import { SmsService } from './sms.service';
import { MessagingService } from './messaging.service';
import { MessageContextService } from './message-context.service';
import { TwilioWebhookController } from './twilio-webhook.controller';
import { TwilioWebhookService } from './twilio-webhook.service';

@Module({
  controllers: [MessagesController, TwilioWebhookController],
  providers: [MessagesService, SmsService, MessagingService, MessageContextService, TwilioWebhookService],
  exports: [MessagesService, SmsService, MessagingService, MessageContextService],
})
export class MessagesModule {}
