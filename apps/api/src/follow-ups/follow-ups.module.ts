import { Module } from '@nestjs/common';
import { FollowUpsController } from './follow-ups.controller';
import { FollowUpsService } from './follow-ups.service';
import { FollowUpReminderModule } from './follow-up-reminder.module';
import { FollowUpComplianceService } from './follow-up-compliance.service';
import { TasksModule } from '../tasks/tasks.module';

@Module({
  imports: [FollowUpReminderModule, TasksModule],
  controllers: [FollowUpsController],
  providers: [FollowUpsService, FollowUpComplianceService],
  exports: [FollowUpsService, FollowUpComplianceService],
})
export class FollowUpsModule {}
