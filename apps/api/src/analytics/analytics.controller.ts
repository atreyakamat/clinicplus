import { Controller, Get, UseGuards, Request } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('api/v1/analytics')
@UseGuards(JwtAuthGuard)
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('dashboard/doctor')
  getDoctorDashboard(@Request() req) {
    return this.analyticsService.getDoctorDashboard(req.user.id, req.user.organizationId, req.user.branchId);
  }
}
