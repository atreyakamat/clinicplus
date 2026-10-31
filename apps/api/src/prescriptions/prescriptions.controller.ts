import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Request,
  Res,
  UseGuards,
} from '@nestjs/common';
import { PrescriptionsService } from './prescriptions.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { PdfService } from '../common/services/pdf.service';
import { OrganizationsService } from '../organizations/organizations.service';
import {
  CancelPrescriptionDto,
  CheckSafetyDto,
  CreatePrescriptionDto,
  ListPrescriptionsQueryDto,
  UpdatePrescriptionDto,
} from './dto/prescription.dto';

@Controller('api/v1/prescriptions')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class PrescriptionsController {
  constructor(
    private readonly prescriptionsService: PrescriptionsService,
    private readonly pdfService: PdfService,
    private readonly organizationsService: OrganizationsService,
  ) {}

  /** Returns 409 (error SAFETY_WARNINGS) unless acknowledgeWarnings=true when checks fire. */
  @Post()
  @Permissions('prescriptions.create')
  create(@Body() dto: CreatePrescriptionDto, @Request() req) {
    return this.prescriptionsService.create(dto, req.user);
  }

  /** Dry-run of the safety checks so the UI can show warnings before saving. */
  @Post('check-safety')
  @Permissions('prescriptions.create')
  async checkSafety(@Body() dto: CheckSafetyDto, @Request() req) {
    const warnings = await this.prescriptionsService.safetyCheck(
      dto.patientId,
      dto.items,
      req.user,
      dto.excludePrescriptionId,
    );
    return { warnings };
  }

  @Get()
  @Permissions('prescriptions.view')
  findAll(@Query() query: ListPrescriptionsQueryDto, @Request() req) {
    return this.prescriptionsService.findAll(req.user, query);
  }

  @Get('patient/:patientId/active')
  @Permissions('prescriptions.view')
  active(@Param('patientId', ParseUUIDPipe) patientId: string, @Request() req) {
    return this.prescriptionsService.activeMedications(patientId, req.user);
  }

  @Get(':id/download')
  @Permissions('prescriptions.view')
  async download(@Param('id', ParseUUIDPipe) id: string, @Request() req, @Res() res) {
    const rx = await this.prescriptionsService.findOne(id, req.user);
    const org = await this.organizationsService.findOne(req.user.organizationId);
    const buffer = await this.pdfService.generatePrescriptionPdf(rx, org);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="prescription-${rx.id.split('-')[0]}.pdf"`,
      'Content-Length': buffer.length,
      'Cache-Control': 'no-store',
    });
    res.end(buffer);
  }

  @Get(':id')
  @Permissions('prescriptions.view')
  findOne(@Param('id', ParseUUIDPipe) id: string, @Request() req) {
    return this.prescriptionsService.findOne(id, req.user);
  }

  /** Prescribing doctor only, ACTIVE only. */
  @Patch(':id')
  @Permissions('prescriptions.update')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdatePrescriptionDto, @Request() req) {
    return this.prescriptionsService.update(id, dto, req.user);
  }

  @Post(':id/cancel')
  @Permissions('prescriptions.update')
  cancel(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CancelPrescriptionDto, @Request() req) {
    return this.prescriptionsService.cancel(id, dto, req.user);
  }

  @Post(':id/complete')
  @Permissions('prescriptions.update')
  complete(@Param('id', ParseUUIDPipe) id: string, @Request() req) {
    return this.prescriptionsService.complete(id, req.user);
  }
}
