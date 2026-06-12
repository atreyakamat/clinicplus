import { Module } from '@nestjs/common';
import { FollowUpReminderService } from './follow-up-reminder.service';
import { MessagesModule } from '../messages/messages.module';

@Module({
  imports: [MessagesModule],
  providers: [FollowUpReminderService],
  exports: [FollowUpReminderService],
})
export class FollowUpReminderModule {}
