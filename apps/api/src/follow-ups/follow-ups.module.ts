import { Module } from '@nestjs/common';
import { FollowUpsController } from './follow-ups.controller';
import { FollowUpsService } from './follow-ups.service';
import { FollowUpReminderModule } from './follow-up-reminder.module';

@Module({
  controllers: [FollowUpsController],
  providers: [FollowUpsService],
  imports: [FollowUpReminderModule],
})
export class FollowUpsModule {}
