import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { ClinicalService } from './clinical.service';
import { CreateAllergyDto, CreateConditionDto, UpdateAllergyDto, UpdateConditionDto } from './dto/clinical.dto';

@Controller('api/v1/clinical')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class ClinicalController {
  constructor(private readonly clinical: ClinicalService) {}

  @Get('patients/:patientId/history')
  @Permissions('clinical.view')
  history(@Param('patientId', ParseUUIDPipe) patientId: string, @Request() req) {
    return this.clinical.history(patientId, req.user);
  }

  @Get('patients/:patientId/allergies')
  @Permissions('clinical.view')
  listAllergies(@Param('patientId', ParseUUIDPipe) patientId: string, @Request() req) {
    return this.clinical.listAllergies(patientId, req.user);
  }

  @Post('patients/:patientId/allergies')
  @Permissions('clinical.update')
  addAllergy(@Param('patientId', ParseUUIDPipe) patientId: string, @Body() dto: CreateAllergyDto, @Request() req) {
    return this.clinical.addAllergy(patientId, dto, req.user);
  }

  @Patch('allergies/:id')
  @Permissions('clinical.update')
  updateAllergy(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateAllergyDto, @Request() req) {
    return this.clinical.updateAllergy(id, dto, req.user);
  }

  @Delete('allergies/:id')
  @Permissions('clinical.update')
  removeAllergy(@Param('id', ParseUUIDPipe) id: string, @Request() req) {
    return this.clinical.removeAllergy(id, req.user);
  }

  @Get('patients/:patientId/conditions')
  @Permissions('clinical.view')
  listConditions(@Param('patientId', ParseUUIDPipe) patientId: string, @Request() req) {
    return this.clinical.listConditions(patientId, req.user);
  }

  @Post('patients/:patientId/conditions')
  @Permissions('clinical.update')
  addCondition(@Param('patientId', ParseUUIDPipe) patientId: string, @Body() dto: CreateConditionDto, @Request() req) {
    return this.clinical.addCondition(patientId, dto, req.user);
  }

  @Patch('conditions/:id')
  @Permissions('clinical.update')
  updateCondition(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateConditionDto, @Request() req) {
    return this.clinical.updateCondition(id, dto, req.user);
  }

  @Delete('conditions/:id')
  @Permissions('clinical.update')
  removeCondition(@Param('id', ParseUUIDPipe) id: string, @Request() req) {
    return this.clinical.removeCondition(id, req.user);
  }
}
