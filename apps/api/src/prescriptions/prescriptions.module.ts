import { Module } from '@nestjs/common';
import { PrescriptionsController } from './prescriptions.controller';
import { PrescriptionsService } from './prescriptions.service';
import { PdfService } from '../common/services/pdf.service';
import { OrganizationsModule } from '../organizations/organizations.module';

@Module({
  imports: [OrganizationsModule],
  controllers: [PrescriptionsController],
  providers: [PrescriptionsService, PdfService]
})
export class PrescriptionsModule {}
