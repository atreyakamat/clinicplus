import { Module } from '@nestjs/common';
import { MessagesController } from './messages.controller';
import { MessagesService } from './messages.service';
import { SmsService } from './sms.service';

@Module({
  controllers: [MessagesController],
  providers: [MessagesService, SmsService],
  exports: [MessagesService],
})
export class MessagesModule {}
