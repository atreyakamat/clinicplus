import { Body, Controller, Delete, Get, Param, Patch, Post, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { RolesService } from './roles.service';
import { CreateRoleDto, UpdateRoleDto } from './dto/role.dto';

@Controller('api/v1/roles')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Get()
  @Permissions('roles.view')
  findAll(@Request() req) {
    return this.rolesService.findAll(req.user);
  }

  @Get(':id')
  @Permissions('roles.view')
  findOne(@Param('id') id: string, @Request() req) {
    return this.rolesService.findOne(id, req.user);
  }

  @Post()
  @Permissions('roles.create')
  create(@Body() dto: CreateRoleDto, @Request() req) {
    return this.rolesService.create(dto, req.user);
  }

  @Patch(':id')
  @Permissions('roles.update')
  update(@Param('id') id: string, @Body() dto: UpdateRoleDto, @Request() req) {
    return this.rolesService.update(id, dto, req.user);
  }

  @Delete(':id')
  @Permissions('roles.delete')
  remove(@Param('id') id: string, @Request() req) {
    return this.rolesService.remove(id, req.user);
  }
}
