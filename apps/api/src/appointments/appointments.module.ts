import { Module } from '@nestjs/common';
import { AppointmentsController } from './appointments.controller';
import { AppointmentsService } from './appointments.service';
import { AppointmentReminderModule } from './appointment-reminder.module';
import { DoctorsModule } from '../doctors/doctors.module';
import { QueuesModule } from '../queues/queues.module';

@Module({
  controllers: [AppointmentsController],
  providers: [AppointmentsService],
  imports: [AppointmentReminderModule, DoctorsModule, QueuesModule],
  exports: [AppointmentsService],
})
export class AppointmentsModule {}
