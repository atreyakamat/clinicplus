import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, Request, UseGuards } from '@nestjs/common';
import { ConsultationsService } from './consultations.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { Permissions } from '../auth/decorators/permissions.decorator';
import {
  ConsultationAddendumDto,
  CreateConsultationDto,
  ListConsultationsQueryDto,
  UpdateConsultationDto,
} from './dto/consultation.dto';

@Controller('api/v1/consultations')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class ConsultationsController {
  constructor(private readonly consultationsService: ConsultationsService) {}

  @Post()
  @Permissions('consultations.create')
  create(@Body() dto: CreateConsultationDto, @Request() req) {
    return this.consultationsService.create(dto, req.user);
  }

  @Get()
  @Permissions('consultations.view')
  findAll(@Query() query: ListConsultationsQueryDto, @Request() req) {
    return this.consultationsService.findAll(req.user, query);
  }

  @Get(':id/workspace')
  @Permissions('consultations.view')
  workspace(@Param('id', ParseUUIDPipe) id: string, @Request() req) {
    return this.consultationsService.workspace(id, req.user);
  }

  @Get(':id')
  @Permissions('consultations.view')
  findOne(@Param('id', ParseUUIDPipe) id: string, @Request() req) {
    return this.consultationsService.findOne(id, req.user);
  }

  /** Draft only, consulting doctor only; completed consultations return 409. */
  @Patch(':id')
  @Permissions('consultations.update')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateConsultationDto, @Request() req) {
    return this.consultationsService.update(id, dto, req.user);
  }

  @Post(':id/complete')
  @Permissions('consultations.update')
  complete(@Param('id', ParseUUIDPipe) id: string, @Request() req) {
    return this.consultationsService.complete(id, req.user);
  }

  @Post(':id/addendum')
  @Permissions('consultations.update')
  addendum(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ConsultationAddendumDto, @Request() req) {
    return this.consultationsService.addAddendum(id, dto, req.user);
  }
}
