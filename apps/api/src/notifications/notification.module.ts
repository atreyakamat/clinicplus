import { Module } from '@nestjs/common';
import { NotificationService } from './notification.service';
import { AppointmentReminderModule } from '../appointments/appointment-reminder.module';
import { FollowUpReminderModule } from '../follow-ups/follow-up-reminder.module';

@Module({
  imports: [AppointmentReminderModule, FollowUpReminderModule],
  providers: [NotificationService],
  exports: [NotificationService],
})
export class NotificationModule {}
