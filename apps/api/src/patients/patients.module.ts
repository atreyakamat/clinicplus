import { Module } from '@nestjs/common';
import { PatientsController } from './patients.controller';
import { PatientsService } from './patients.service';
import { PatientImportService } from './patient-import.service';
import { TimelineModule } from '../timeline/timeline.module';

@Module({
  imports: [TimelineModule],
  controllers: [PatientsController],
  providers: [PatientsService, PatientImportService],
  exports: [PatientsService],
})
export class PatientsModule {}
