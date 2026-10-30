import { Body, Controller, Get, Param, Patch, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { OrganizationsService } from './organizations.service';
import { UpdateBrandingDto, UpdateOrganizationDto } from './dto/update-organization.dto';

@Controller('api/v1/organizations')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class OrganizationsController {
  constructor(private readonly organizationsService: OrganizationsService) {}

  /** The caller's own organization (settings screen). */
  @Get('current')
  @Permissions('organizations.view')
  current(@Request() req) {
    return this.organizationsService.findOne(req.user.organizationId, req.user.organizationId);
  }

  @Patch('current')
  @Permissions('organizations.update')
  updateCurrent(@Body() dto: UpdateOrganizationDto, @Request() req) {
    return this.organizationsService.update(req.user.organizationId, dto, req.user.organizationId, req.user.id);
  }

  /** Branding only (logo, colours, letterhead, footer) — for staff with settings.branding. */
  @Patch('current/branding')
  @Permissions('settings.branding')
  updateBranding(@Body() dto: UpdateBrandingDto, @Request() req) {
    return this.organizationsService.update(req.user.organizationId, dto, req.user.organizationId, req.user.id);
  }

  @Get(':id')
  @Permissions('organizations.view')
  findOne(@Param('id') id: string, @Request() req) {
    return this.organizationsService.findOne(id, req.user.organizationId);
  }

  @Patch(':id')
  @Permissions('organizations.update')
  update(@Param('id') id: string, @Body() dto: UpdateOrganizationDto, @Request() req) {
    return this.organizationsService.update(id, dto, req.user.organizationId, req.user.id);
  }
}
