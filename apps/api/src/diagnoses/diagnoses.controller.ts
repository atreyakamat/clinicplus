import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { DiagnosesService } from './diagnoses.service';
import { CreateDiagnosisDto, DiagnosesQueryDto, UpdateDiagnosisDto } from './dto/diagnosis.dto';

@Controller('api/v1/diagnoses')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class DiagnosesController {
  constructor(private readonly diagnoses: DiagnosesService) {}

  @Get()
  @Permissions('diagnoses.view')
  list(@Query() q: DiagnosesQueryDto, @Request() req) {
    return this.diagnoses.list(q, req.user);
  }

  @Post()
  @Permissions('diagnoses.create')
  create(@Body() dto: CreateDiagnosisDto, @Request() req) {
    return this.diagnoses.create(dto, req.user);
  }

  @Patch(':id')
  @Permissions('diagnoses.create')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateDiagnosisDto, @Request() req) {
    return this.diagnoses.update(id, dto, req.user);
  }

  @Delete(':id')
  @Permissions('diagnoses.create')
  remove(@Param('id', ParseUUIDPipe) id: string, @Request() req) {
    return this.diagnoses.remove(id, req.user);
  }
}
