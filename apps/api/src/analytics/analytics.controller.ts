import { Controller, Get, UseGuards, Request } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Permissions } from '../auth/decorators/permissions.decorator';

@Controller('api/v1/analytics')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('dashboard/doctor')
  @Roles('super-admin', 'organization-owner', 'clinic-admin', 'doctor')
  @Permissions('analytics:view')
  getDoctorDashboard(@Request() req) {
    return this.analyticsService.getDoctorDashboard(
      req.user.id,
      req.user.organizationId,
      req.user.branchId,
    );
  }
}
