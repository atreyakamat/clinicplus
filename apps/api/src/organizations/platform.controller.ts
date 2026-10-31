import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { PlatformService } from './platform.service';

/**
 * Founder / platform administration. Cross-tenant by design, so it is guarded by
 * admin.view, which only the Super Admin role holds and nobody can delegate
 * without holding it.
 */
@Controller('api/v1/platform')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class PlatformController {
  constructor(private readonly platform: PlatformService) {}

  @Get('metrics')
  @Permissions('admin.view')
  metrics() {
    return this.platform.metrics();
  }
}
