import { Module } from '@nestjs/common';
import { AppointmentReminderService } from './appointment-reminder.service';
import { MessagesModule } from '../messages/messages.module';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [MessagesModule, PrismaModule],
  providers: [AppointmentReminderService],
  exports: [AppointmentReminderService],
})
export class AppointmentReminderModule {}