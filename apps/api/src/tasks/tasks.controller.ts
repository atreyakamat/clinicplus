import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Patch,
  Delete,
  UseGuards,
  Request,
} from '@nestjs/common';
import { TasksService } from './tasks.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Permissions } from '../auth/decorators/permissions.decorator';

@Controller('api/v1/tasks')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Post()
  @Roles(
    'super-admin',
    'organization-owner',
    'clinic-admin',
    'doctor',
    'receptionist',
    'nurse',
  )
  @Permissions('tasks:create')
  create(@Body() data: any, @Request() req) {
    return this.tasksService.create(
      data,
      req.user.organizationId,
      req.user.branchId,
      req.user.id,
    );
  }

  @Get()
  findAll(@Request() req) {
    return this.tasksService.findAll(
      req.user.organizationId,
      req.user.branchId,
    );
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Request() req) {
    return this.tasksService.findOne(
      id,
      req.user.organizationId,
      req.user.branchId,
    );
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() data: any, @Request() req) {
    data.updatedBy = req.user.id;
    return this.tasksService.update(
      id,
      data,
      req.user.organizationId,
      req.user.branchId,
    );
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Request() req) {
    return this.tasksService.remove(
      id,
      req.user.organizationId,
      req.user.branchId,
    );
  }
}
