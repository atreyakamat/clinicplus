import { Module } from '@nestjs/common';
import { AppointmentReminderService } from './appointment-reminder.service';
import { MessagesModule } from '../messages/messages.module';

@Module({
  imports: [MessagesModule],
  providers: [AppointmentReminderService],
  exports: [AppointmentReminderService],
})
export class AppointmentReminderModule {}
