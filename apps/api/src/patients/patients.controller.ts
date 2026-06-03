import { Controller, Post, Get, Body, UseGuards, Request, Res, Query, Param, Patch, Delete } from '@nestjs/common';
import { PatientsService } from './patients.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { stringify } from 'csv-stringify/sync';

@Controller('api/v1/patients')
@UseGuards(JwtAuthGuard)
export class PatientsController {
  constructor(private readonly patientsService: PatientsService) {}

  @Post()
  create(@Body() data: any, @Request() req) {
    return this.patientsService.create(data, req.user.organizationId, req.user.branchId, req.user.id);
  }

  // ... other endpoints (findAll, findOne, etc.)

  @Get(':id')
  findOne(@Param('id') id: string, @Request() req) {
    return this.patientsService.findOne(id, req.user.organizationId, req.user.branchId);
  }

  @Get('export/csv')
  async exportCsv(@Request() req, @Res() res) {
    const patients = await this.patientsService.findAll(req.user.organizationId, req.user.branchId);
    
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

  @Get('search')
  async search(@Request() req, @Query('q') query: string) {
    return this.patientsService.search(req.user.organizationId, query);
  }

  @Post('import/csv')
  async importCsv(@Body() data: any[], @Request() req) {
    // Process imported patients (bulk create)
    const patientsToCreate = data.map(row => ({
      ...row,
      organizationId: req.user.organizationId,
      branchId: req.user.branchId,
      createdBy: req.user.id,
    }));
    
    // In a real app, use this.patientsService.bulkCreate(patientsToCreate);
    return { imported: patientsToCreate.length };
  }
}
