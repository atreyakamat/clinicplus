import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { PortalAuthGuard } from './portal-auth.guard';
import { PortalPatient } from './portal-patient.decorator';
import type { PortalPatientContext } from './portal.constants';
import { PortalService } from './portal.service';
import {
  PortalBookAppointmentDto,
  PortalCancelAppointmentDto,
  PortalSlotsQueryDto,
  UpdatePortalProfileDto,
} from './dto/portal.dto';

/**
 * Patient-scoped self-service endpoints. Every handler is authenticated by the
 * PortalAuthGuard and operates ONLY on the authenticated patient's own data,
 * scoped by both organizationId and patientId. There is no cross-patient access.
 */
@Controller('api/v1/portal')
@UseGuards(PortalAuthGuard)
export class PortalController {
  constructor(private readonly portal: PortalService) {}

  // ---- profile
  @Get('me')
  getMe(@PortalPatient() ctx: PortalPatientContext) {
    return this.portal.getMe(ctx);
  }

  @Patch('me')
  updateMe(@PortalPatient() ctx: PortalPatientContext, @Body() dto: UpdatePortalProfileDto) {
    return this.portal.updateMe(ctx, dto);
  }

  // ---- appointments & booking
  @Get('appointments')
  appointments(@PortalPatient() ctx: PortalPatientContext) {
    return this.portal.listAppointments(ctx);
  }

  @Post('appointments')
  book(@PortalPatient() ctx: PortalPatientContext, @Body() dto: PortalBookAppointmentDto) {
    return this.portal.book(ctx, dto);
  }

  @Delete('appointments/:id')
  cancel(
    @PortalPatient() ctx: PortalPatientContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PortalCancelAppointmentDto,
  ) {
    return this.portal.cancelAppointment(ctx, id, dto?.reason);
  }

  @Get('doctors')
  doctors(@PortalPatient() ctx: PortalPatientContext) {
    return this.portal.listDoctors(ctx);
  }

  @Get('doctors/:id/slots')
  slots(
    @PortalPatient() ctx: PortalPatientContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: PortalSlotsQueryDto,
  ) {
    return this.portal.doctorSlots(ctx, id, query.date);
  }

  // ---- prescriptions
  @Get('prescriptions')
  prescriptions(@PortalPatient() ctx: PortalPatientContext) {
    return this.portal.listPrescriptions(ctx);
  }

  @Get('prescriptions/:id/download')
  async prescriptionPdf(
    @PortalPatient() ctx: PortalPatientContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
  ) {
    const { buffer, filename } = await this.portal.prescriptionPdf(ctx, id);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': String(buffer.length),
      'Cache-Control': 'no-store',
    });
    res.end(buffer);
  }

  // ---- invoices & online payment
  @Get('invoices')
  invoices(@PortalPatient() ctx: PortalPatientContext) {
    return this.portal.listInvoices(ctx);
  }

  @Get('invoices/:id')
  invoice(@PortalPatient() ctx: PortalPatientContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.portal.getInvoice(ctx, id);
  }

  @Post('invoices/:id/pay-link')
  @HttpCode(200)
  payLink(@PortalPatient() ctx: PortalPatientContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.portal.createPayLink(ctx, id);
  }

  // ---- documents
  @Get('documents')
  documents(@PortalPatient() ctx: PortalPatientContext) {
    return this.portal.listDocuments(ctx);
  }

  @Get('documents/:id/download')
  async documentDownload(
    @PortalPatient() ctx: PortalPatientContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const { stream, mimeType, fileSize, filename } = await this.portal.downloadDocument(ctx, id, {
      ip: req.ip,
      userAgent: req.get('user-agent') ?? undefined,
    });
    res.set({
      'Content-Type': mimeType,
      'Content-Disposition': `attachment; filename="${filename}"`,
      ...(fileSize ? { 'Content-Length': String(fileSize) } : {}),
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    stream.on('error', () => res.destroy());
    stream.pipe(res);
  }

  // ---- follow-ups
  @Get('follow-ups')
  followUps(@PortalPatient() ctx: PortalPatientContext) {
    return this.portal.listFollowUps(ctx);
  }
}
