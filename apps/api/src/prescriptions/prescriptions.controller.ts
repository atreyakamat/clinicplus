import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  Res,
} from '@nestjs/common';
import { PrescriptionsService } from './prescriptions.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PdfService } from '../common/services/pdf.service';
import { OrganizationsService } from '../organizations/organizations.service';

@Controller('api/v1/prescriptions')
@UseGuards(JwtAuthGuard)
export class PrescriptionsController {
  constructor(
    private readonly prescriptionsService: PrescriptionsService,
    private readonly pdfService: PdfService,
    private readonly organizationsService: OrganizationsService,
  ) {}

  @Post()
  create(@Body() data: any, @Request() req) {
    data.organizationId = req.user.organizationId;
    data.branchId = req.user.branchId;
    data.doctorId = req.user.id;
    return this.prescriptionsService.create(data);
  }

  @Get(':id/download')
  async download(@Param('id') id: string, @Request() req, @Res() res) {
    const rx = await this.prescriptionsService.findOne(
      id,
      req.user.organizationId,
      req.user.branchId,
    );
    const org = await this.organizationsService.findOne(
      req.user.organizationId,
    );

    const buffer = await this.pdfService.generatePrescriptionPdf(rx, org);

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="prescription-${rx.id.split('-')[0]}.pdf"`,
      'Content-Length': buffer.length,
    });

    res.end(buffer);
  }

  @Get()
  findAll(@Query('patientId') patientId: string | undefined, @Request() req) {
    return this.prescriptionsService.findAll(
      req.user.organizationId,
      req.user.branchId,
      patientId,
    );
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Request() req) {
    return this.prescriptionsService.findOne(
      id,
      req.user.organizationId,
      req.user.branchId,
    );
  }
}
