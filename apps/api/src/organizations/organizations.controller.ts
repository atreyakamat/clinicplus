import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { OrganizationsService } from './organizations.service';

@Controller('api/v1/organizations')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class OrganizationsController {
  constructor(private readonly organizationsService: OrganizationsService) {}

  @Get(':id')
  @Permissions('organizations:read')
  findOne(@Param('id') id: string, @Request() req) {
    return this.organizationsService.findOne(id, req.user.organizationId);
  }

  @Patch(':id')
  @Permissions('organizations:update')
  update(@Param('id') id: string, @Body() data: any, @Request() req) {
    return this.organizationsService.update(id, data, req.user.organizationId);
  }
}
