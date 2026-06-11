import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Request,
  UseGuards,
  Query,
} from '@nestjs/common';
import { ConsultationsService } from './consultations.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { Permissions } from '../auth/decorators/permissions.decorator';

@Controller('api/v1/consultations')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class ConsultationsController {
  constructor(private readonly consultationsService: ConsultationsService) {}

  @Post()
  @Permissions('consultations:create')
  create(@Body() data: any, @Request() req) {
    data.organizationId = req.user.organizationId;
    data.branchId = req.user.branchId;
    data.doctorId = req.user.id;
    data.createdBy = req.user.id;
    return this.consultationsService.create(data);
  }

  @Get()
  @Permissions('consultations:read')
  findAll(@Query('patientId') patientId: string | undefined, @Request() req) {
    return this.consultationsService.findAll(
      req.user.organizationId,
      req.user.branchId,
      patientId,
    );
  }

  @Get(':id')
  @Permissions('consultations:read')
  findOne(@Param('id') id: string, @Request() req) {
    return this.consultationsService.findOne(
      id,
      req.user.organizationId,
      req.user.branchId,
    );
  }

  @Patch(':id')
  @Permissions('consultations:update')
  update(@Param('id') id: string, @Body() data: any, @Request() req) {
    data.updatedBy = req.user.id;
    return this.consultationsService.update(
      id,
      data,
      req.user.organizationId,
      req.user.branchId,
    );
  }

  @Post(':id/complete')
  @Permissions('consultations:update')
  complete(@Param('id') id: string, @Request() req) {
    return this.consultationsService.complete(
      id,
      req.user.organizationId,
      req.user.branchId,
    );
  }
}
