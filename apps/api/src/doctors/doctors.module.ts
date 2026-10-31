import { Module } from '@nestjs/common';
import { DoctorsController } from './doctors.controller';
import { DoctorsService } from './doctors.service';
import { ScheduleService } from './schedule.service';

@Module({
  controllers: [DoctorsController],
  providers: [DoctorsService, ScheduleService],
  exports: [DoctorsService, ScheduleService],
})
export class DoctorsModule {}
