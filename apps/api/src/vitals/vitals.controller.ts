import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { VitalsService } from './vitals.service';
import { CreateVitalDto, VitalsHistoryQueryDto, VitalsQueryDto } from './dto/vital.dto';

@Controller('api/v1/vitals')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class VitalsController {
  constructor(private readonly vitals: VitalsService) {}

  @Post()
  @Permissions('vitals.create')
  create(@Body() dto: CreateVitalDto, @Request() req) {
    return this.vitals.create(dto, req.user);
  }

  @Get()
  @Permissions('vitals.view')
  forConsultation(@Query() q: VitalsQueryDto, @Request() req) {
    return this.vitals.forConsultation(q.consultationId, req.user);
  }

  @Get('patient/:patientId')
  @Permissions('vitals.view')
  history(@Param('patientId', ParseUUIDPipe) patientId: string, @Query() q: VitalsHistoryQueryDto, @Request() req) {
    return this.vitals.patientHistory(patientId, req.user, q);
  }
}
