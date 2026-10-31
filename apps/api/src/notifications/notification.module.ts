import { Module } from '@nestjs/common';
import { NotificationService } from './notification.service';
import { AutomationsController } from './automations.controller';
import { AppointmentReminderModule } from '../appointments/appointment-reminder.module';
import { FollowUpReminderModule } from '../follow-ups/follow-up-reminder.module';
import { CampaignsModule } from '../campaigns/campaigns.module';

@Module({
  imports: [AppointmentReminderModule, FollowUpReminderModule, CampaignsModule],
  controllers: [AutomationsController],
  providers: [NotificationService],
  exports: [NotificationService],
})
export class NotificationModule {}
