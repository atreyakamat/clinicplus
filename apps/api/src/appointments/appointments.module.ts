import { Module } from '@nestjs/common';
import { AppointmentsController } from './appointments.controller';
import { AppointmentsService } from './appointments.service';
import { AppointmentReminderModule } from './appointment-reminder.module';

@Module({
  controllers: [AppointmentsController],
  providers: [AppointmentsService],
  imports: [AppointmentReminderModule],
})
export class AppointmentsModule {}
