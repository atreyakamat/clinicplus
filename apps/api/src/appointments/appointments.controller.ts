import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Request,
  Res,
  UseGuards,
} from '@nestjs/common';
import { stringify } from 'csv-stringify/sync';
import { csvSafeRows } from '../common/csv';
import { AppointmentsService } from './appointments.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { Permissions } from '../auth/decorators/permissions.decorator';
import {
  CancelAppointmentDto,
  CreateAppointmentDto,
  CreateWaitlistDto,
  ListAppointmentsQueryDto,
  ListWaitlistQueryDto,
  RescheduleAppointmentDto,
  UpdateAppointmentDto,
  UpdateWaitlistDto,
} from './dto/create-appointment.dto';

@Controller('api/v1/appointments')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class AppointmentsController {
  constructor(private readonly appointmentsService: AppointmentsService) {}

  @Post()
  @Permissions('appointments.create')
  create(@Body() dto: CreateAppointmentDto, @Request() req) {
    return this.appointmentsService.create(req.user, dto);
  }

  @Get('export/csv')
  @Permissions('appointments.export')
  async exportCsv(@Request() req, @Query() q: ListAppointmentsQueryDto, @Res() res) {
    const rows = await this.appointmentsService.exportRows(req.user, q);
    const csvData = stringify(
      csvSafeRows(
        rows.map((a) => ({
          start: a.scheduledStart.toISOString(),
          end: a.scheduledEnd.toISOString(),
          status: a.status,
          type: a.appointmentType ?? '',
          patient: `${a.patient?.firstName ?? ''} ${a.patient?.lastName ?? ''}`.trim(),
          phone: a.patient?.phone ?? '',
          doctor: `${a.doctor?.firstName ?? ''} ${a.doctor?.lastName ?? ''}`.trim(),
          cancellationReason: a.cancellationReason ?? '',
        })),
      ),
      {
        header: true,
        columns: [
          { key: 'start', header: 'Start Time' },
          { key: 'end', header: 'End Time' },
          { key: 'status', header: 'Status' },
          { key: 'type', header: 'Type' },
          { key: 'patient', header: 'Patient' },
          { key: 'phone', header: 'Phone' },
          { key: 'doctor', header: 'Doctor' },
          { key: 'cancellationReason', header: 'Cancellation Reason' },
        ],
      },
    );
    res.set({
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="appointments-${new Date().toISOString().split('T')[0]}.csv"`,
    });
    return res.send(csvData);
  }

  // ---- waitlist (declared before :id routes)
  @Get('waitlist')
  @Permissions('appointments.view')
  listWaitlist(@Request() req, @Query() q: ListWaitlistQueryDto) {
    return this.appointmentsService.listWaitlist(req.user, q);
  }

  @Post('waitlist')
  @Permissions('appointments.create')
  addToWaitlist(@Request() req, @Body() dto: CreateWaitlistDto) {
    return this.appointmentsService.addToWaitlist(req.user, dto);
  }

  @Patch('waitlist/:id')
  @Permissions('appointments.update')
  updateWaitlist(@Request() req, @Param('id') id: string, @Body() dto: UpdateWaitlistDto) {
    return this.appointmentsService.updateWaitlist(req.user, id, dto);
  }

  @Delete('waitlist/:id')
  @Permissions('appointments.update')
  removeFromWaitlist(@Request() req, @Param('id') id: string) {
    return this.appointmentsService.removeFromWaitlist(req.user, id);
  }

  /** Filters: date | from/to, doctorId, patientId, status (comma list), includeCancelled, page, limit. */
  @Get()
  @Permissions('appointments.view')
  findAll(@Request() req, @Query() q: ListAppointmentsQueryDto) {
    return this.appointmentsService.findAll(req.user, q);
  }

  @Get(':id')
  @Permissions('appointments.view')
  findOne(@Param('id') id: string, @Request() req) {
    return this.appointmentsService.findOne(req.user, id);
  }

  @Patch(':id')
  @Permissions('appointments.update')
  update(@Param('id') id: string, @Body() dto: UpdateAppointmentDto, @Request() req) {
    return this.appointmentsService.update(req.user, id, dto);
  }

  @Post(':id/reschedule')
  @HttpCode(200)
  @Permissions('appointments.update')
  reschedule(@Param('id') id: string, @Body() dto: RescheduleAppointmentDto, @Request() req) {
    return this.appointmentsService.reschedule(req.user, id, dto);
  }

  @Post(':id/confirm')
  @HttpCode(200)
  @Permissions('appointments.update')
  confirm(@Param('id') id: string, @Request() req) {
    return this.appointmentsService.transition(req.user, id, 'CONFIRMED');
  }

  /** Marks the patient arrived and issues a queue token. */
  @Post(':id/check-in')
  @HttpCode(200)
  @Permissions('appointments.update', 'queues.update')
  checkIn(@Param('id') id: string, @Request() req) {
    return this.appointmentsService.transition(req.user, id, 'CHECKED_IN');
  }

  @Post(':id/start')
  @HttpCode(200)
  @Permissions('appointments.update')
  start(@Param('id') id: string, @Request() req) {
    return this.appointmentsService.transition(req.user, id, 'IN_PROGRESS');
  }

  @Post(':id/complete')
  @HttpCode(200)
  @Permissions('appointments.update')
  complete(@Param('id') id: string, @Request() req) {
    return this.appointmentsService.transition(req.user, id, 'COMPLETED');
  }

  @Post(':id/no-show')
  @HttpCode(200)
  @Permissions('appointments.update')
  noShow(@Param('id') id: string, @Request() req) {
    return this.appointmentsService.transition(req.user, id, 'NO_SHOW');
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @Permissions('appointments.delete')
  cancel(@Param('id') id: string, @Body() dto: CancelAppointmentDto, @Request() req) {
    return this.appointmentsService.transition(req.user, id, 'CANCELLED', { reason: dto.reason });
  }

  @Delete(':id')
  @Permissions('appointments.delete')
  remove(@Param('id') id: string, @Request() req) {
    return this.appointmentsService.remove(req.user, id);
  }
}
