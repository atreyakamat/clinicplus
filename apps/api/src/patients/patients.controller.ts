import { Controller, Get, Post, Body, Patch, Param, Delete, Query, UseGuards } from '@nestjs/common';
import { PatientsService } from './patients.service';
import { Prisma } from '@prisma/client';

@Controller('api/v1/patients')
export class PatientsController {
  constructor(private readonly patientsService: PatientsService) {}

  @Post()
  create(@Body() createPatientDto: Prisma.PatientCreateInput) {
    return this.patientsService.create(createPatientDto);
  }

  @Get()
  findAll(
    @Query('orgId') orgId: string, 
    @Query('branchId') branchId: string
  ) {
    // In a real app, orgId and branchId would come from JWT / context
    return this.patientsService.findAll(orgId, branchId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.patientsService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updatePatientDto: Prisma.PatientUpdateInput) {
    return this.patientsService.update(id, updatePatientDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.patientsService.remove(id);
  }
}
