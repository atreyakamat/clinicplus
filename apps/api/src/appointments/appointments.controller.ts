import { Controller, Get, Post, Body, Patch, Param, Delete, Query, UseGuards, Request, Res } from '@nestjs/common';
import { AppointmentsService } from './appointments.service';
import { Prisma } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { stringify } from 'csv-stringify/sync';

@Controller('api/v1/appointments')
@UseGuards(JwtAuthGuard)
export class AppointmentsController {
  constructor(private readonly appointmentsService: AppointmentsService) {}

  @Post()
  create(@Body() data: any, @Request() req) {
    data.organizationId = req.user.organizationId;
    data.branchId = req.user.branchId;
    data.createdBy = req.user.id;
    return this.appointmentsService.create(data, req.user.organizationId, req.user.branchId, req.user.id);
  }

  @Get('export/csv')
  async exportCsv(@Request() req, @Res() res) {
    const appointments = await this.appointmentsService.findAll(req.user.organizationId, req.user.branchId);
    
    const csvData = stringify(appointments, {
      header: true,
      columns: [
        { key: 'scheduledStart', header: 'Start Time' },
        { key: 'scheduledEnd', header: 'End Time' },
        { key: 'status', header: 'Status' },
        { key: 'patient.firstName', header: 'Patient First Name' },
        { key: 'patient.lastName', header: 'Patient Last Name' },
        { key: 'doctor.lastName', header: 'Doctor' },
      ],
    });

    res.set({
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="appointments-${new Date().toISOString().split('T')[0]}.csv"`,
    });

    return res.send(csvData);
  }

  @Get()
  findAll(@Request() req, @Query('date') date?: string) {
    return this.appointmentsService.findAll(req.user.organizationId, req.user.branchId, date);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Request() req) {
    return this.appointmentsService.findOne(id, req.user.organizationId, req.user.branchId);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() data: any, @Request() req) {
    return this.appointmentsService.update(id, data, req.user.organizationId, req.user.branchId, req.user.id);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Request() req) {
    return this.appointmentsService.remove(id, req.user.organizationId, req.user.branchId, req.user.id);
  }
}
