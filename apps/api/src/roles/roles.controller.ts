import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { RolesService } from './roles.service';

@Controller('api/v1/roles')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Get()
  @Permissions('roles:read')
  findAll(@Request() req) {
    return this.rolesService.findAll(req.user.organizationId);
  }

  @Get(':id')
  @Permissions('roles:read')
  findOne(@Param('id') id: string) {
    return this.rolesService.findOne(id);
  }

  @Post()
  @Permissions('roles:create')
  create(@Body() data: any, @Request() req) {
    return this.rolesService.create({
      ...data,
      organizationId: req.user.organizationId,
    });
  }

  @Patch(':id')
  @Permissions('roles:update')
  update(@Param('id') id: string, @Body() data: any) {
    return this.rolesService.update(id, data);
  }
}
