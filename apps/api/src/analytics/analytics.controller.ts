import { Controller, Get, Param, ParseUUIDPipe, Query, Request, UseGuards } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { AnalyticsQueryDto, TodayQueryDto } from './analytics.dto';

@Controller('api/v1/analytics')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  /** Clinic KPIs; includes revenue only for analytics.financial holders. */
  @Get('overview')
  @Permissions('analytics.view')
  overview(@Query() q: AnalyticsQueryDto, @Request() req) {
    return this.analyticsService.overview(req.user, q);
  }

  @Get('revenue')
  @Permissions('analytics.financial')
  revenue(@Query() q: AnalyticsQueryDto, @Request() req) {
    return this.analyticsService.revenueTrends(req.user, q);
  }

  @Get('retention')
  @Permissions('analytics.view')
  retention(@Query() q: AnalyticsQueryDto, @Request() req) {
    return this.analyticsService.retention(req.user, q);
  }

  @Get('branches')
  @Permissions('analytics.view')
  branches(@Query() q: AnalyticsQueryDto, @Request() req) {
    return this.analyticsService.branches(req.user, q);
  }

  /** The calling doctor's own practice analytics. */
  @Get('doctor/me')
  @Permissions('analytics.doctor')
  myDoctorAnalytics(@Query() q: AnalyticsQueryDto, @Request() req) {
    return this.analyticsService.doctor(req.user, req.user.id, q, true);
  }

  /** Any doctor's analytics, for managers (analytics.view). */
  @Get('doctors/:doctorId')
  @Permissions('analytics.view')
  doctorAnalytics(@Param('doctorId', ParseUUIDPipe) doctorId: string, @Query() q: AnalyticsQueryDto, @Request() req) {
    return this.analyticsService.doctor(req.user, doctorId, q, doctorId === req.user.id);
  }

  /** Today's snapshot for the dashboard (blocks gated by the caller's permissions). */
  @Get('today')
  @Permissions('dashboard.view')
  today(@Query() q: TodayQueryDto, @Request() req) {
    return this.analyticsService.today(req.user, q);
  }
}
