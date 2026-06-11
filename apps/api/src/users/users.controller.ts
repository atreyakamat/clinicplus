import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { UsersService } from './users.service';

@Controller('api/v1/users')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @Permissions('users:read')
  findAll(@Request() req, @Query('role') role?: string) {
    return this.usersService.findAll(
      req.user.organizationId,
      req.user.branchId,
      role,
    );
  }

  @Get(':id')
  @Permissions('users:read')
  findOne(@Param('id') id: string, @Request() req) {
    return this.usersService.findOne(
      id,
      req.user.organizationId,
      req.user.branchId,
    );
  }

  @Patch(':id')
  @Permissions('users:update')
  update(@Param('id') id: string, @Body() data: any, @Request() req) {
    return this.usersService.update(
      id,
      data,
      req.user.organizationId,
      req.user.branchId,
    );
  }
}
