import { Controller, Get, Post, Body, Patch, Param, Request, UseGuards, Query } from '@nestjs/common';
import { ConsultationsService } from './consultations.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('api/v1/consultations')
@UseGuards(JwtAuthGuard)
export class ConsultationsController {
  constructor(private readonly consultationsService: ConsultationsService) {}

  @Post()
  create(@Body() data: any, @Request() req) {
    return this.consultationsService.create(data, req.user.organizationId, req.user.branchId, req.user.id);
  }

  @Get()
  findAllByPatient(@Query('patientId') patientId: string, @Request() req) {
    return this.consultationsService.findAllByPatient(patientId, req.user.organizationId, req.user.branchId);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Request() req) {
    return this.consultationsService.findOne(id, req.user.organizationId, req.user.branchId);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() data: any, @Request() req) {
    data.updatedBy = req.user.id;
    return this.consultationsService.update(id, data, req.user.organizationId, req.user.branchId);
  }

  @Post(':id/complete')
  complete(@Param('id') id: string, @Request() req) {
    return this.consultationsService.complete(id, req.user.organizationId, req.user.branchId);
  }
}
