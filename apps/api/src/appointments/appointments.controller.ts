import { Controller, Get, Post, Body, Patch, Param, Delete, Query, UseGuards, Request, Res } from '@nestjs/common';
import { AppointmentsService } from './appointments.service';
import { Prisma } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { stringify } from 'csv-stringify/sync';

@Controller('api/v1/appointments')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class AppointmentsController {
  constructor(private readonly appointmentsService: AppointmentsService) {}

  @Post()
  @Roles('super-admin', 'organization-owner', 'clinic-admin', 'doctor', 'receptionist')
  @Permissions('appointments:create')
  create(@Body() data: any, @Request() req) {
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
  @Roles('super-admin', 'organization-owner', 'clinic-admin', 'doctor', 'receptionist')
  @Permissions('appointments:update')
  update(@Param('id') id: string, @Body() data: any, @Request() req) {
    data.updatedBy = req.user.id;
    return this.appointmentsService.update(id, data, req.user.organizationId, req.user.branchId, req.user.id);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.appointmentsService.remove(id);
  }
}
