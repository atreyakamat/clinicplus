import {
  Controller,
  Post,
  Get,
  Body,
  UseGuards,
  Request,
  Res,
  Query,
  Param,
  Patch,
  Delete,
} from '@nestjs/common';
import { PatientsService } from './patients.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { stringify } from 'csv-stringify/sync';
import { CreatePatientDto } from './dto/create-patient.dto';

@Controller('api/v1/patients')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class PatientsController {
  constructor(private readonly patientsService: PatientsService) {}

  @Get('search')
  @Permissions('patients:read')
  async search(@Request() req, @Query('q') query: string) {
    return this.patientsService.search(req.user.organizationId, query);
  }

  @Post()
  @Permissions('patients:create')
  create(@Body() data: CreatePatientDto, @Request() req) {
    return this.patientsService.create({
      ...data,
      organizationId: req.user.organizationId,
      branchId: req.user.branchId,
      createdBy: req.user.id,
    });
  }

  @Get()
  @Permissions('patients:read')
  findAll(@Request() req) {
    return this.patientsService.findAll(
      req.user.organizationId,
      req.user.branchId,
    );
  }

  @Get('export/csv')
  @Permissions('patients:export')
  async exportCsv(@Request() req, @Res() res) {
    const patients = await this.patientsService.findAll(
      req.user.organizationId,
      req.user.branchId,
    );

    const csvData = stringify(patients, {
      header: true,
      columns: [
        { key: 'patientCode', header: 'Patient ID' },
        { key: 'firstName', header: 'First Name' },
        { key: 'lastName', header: 'Last Name' },
        { key: 'email', header: 'Email' },
        { key: 'phone', header: 'Phone' },
        { key: 'gender', header: 'Gender' },
        { key: 'dateOfBirth', header: 'DOB' },
      ],
    });

    res.set({
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="patients-${new Date().toISOString().split('T')[0]}.csv"`,
    });

    return res.send(csvData);
  }

  @Get(':id')
  @Permissions('patients:read')
  findOne(@Param('id') id: string, @Request() req) {
    return this.patientsService.findOne(
      id,
      req.user.organizationId,
      req.user.branchId,
    );
  }

  @Patch(':id')
  @Permissions('patients:update')
  update(@Param('id') id: string, @Body() data: any, @Request() req) {
    return this.patientsService.update(
      id,
      {
        ...data,
        updatedBy: req.user.id,
      },
      req.user.organizationId,
      req.user.branchId,
    );
  }

  @Delete(':id')
  @Permissions('patients:delete')
  remove(@Param('id') id: string, @Request() req) {
    return this.patientsService.remove(
      id,
      req.user.organizationId,
      req.user.branchId,
      req.user.id,
    );
  }
}

