import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { Permissions } from '../auth/decorators/permissions.decorator';
import {
  CreateDepartmentDto,
  DepartmentsService,
  ListDepartmentsQueryDto,
  UpdateDepartmentDto,
} from './departments.service';

@Controller('api/v1/departments')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class DepartmentsController {
  constructor(private readonly departments: DepartmentsService) {}

  @Get()
  @Permissions('departments.view')
  list(@Request() req, @Query() q: ListDepartmentsQueryDto) {
    return this.departments.list(req.user, q);
  }

  @Get(':id')
  @Permissions('departments.view')
  get(@Request() req, @Param('id') id: string) {
    return this.departments.get(req.user, id);
  }

  @Post()
  @Permissions('departments.manage')
  create(@Request() req, @Body() dto: CreateDepartmentDto) {
    return this.departments.create(req.user, dto);
  }

  @Patch(':id')
  @Permissions('departments.manage')
  update(@Request() req, @Param('id') id: string, @Body() dto: UpdateDepartmentDto) {
    return this.departments.update(req.user, id, dto);
  }

  @Delete(':id')
  @Permissions('departments.manage')
  archive(@Request() req, @Param('id') id: string) {
    return this.departments.archive(req.user, id);
  }
}
