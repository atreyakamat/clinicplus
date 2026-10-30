import { Body, Controller, Get, Param, Patch, Post, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { assertUuid } from '../common/validation/uuid';
import { SubscriptionService } from './subscription.service';
import { AdminSubscriptionDto, ChangePlanDto } from './dto';

/**
 * Clinic subscription & plan management.
 *
 * This whole path is on JwtStrategy's SUBSCRIPTION_SAFELIST, so staff of a
 * suspended clinic can still reach it to see usage and reactivate a plan.
 *
 * `subscription.manage` is held by the Organization Owner only (Clinic Admin is
 * explicitly excluded in the role matrix), so PATCH / is Owner-only by RBAC.
 * `admin.view` is held by Super Admin only, so the override route is cross-tenant
 * support tooling.
 */
@Controller('api/v1/subscription')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class SubscriptionController {
  constructor(private readonly subscriptions: SubscriptionService) {}

  @Get()
  @Permissions('subscription.view')
  summary(@Request() req) {
    return this.subscriptions.getSummary(req.user.organizationId);
  }

  @Patch()
  @Permissions('subscription.manage')
  changePlan(@Request() req, @Body() dto: ChangePlanDto) {
    return this.subscriptions.changePlan(req.user.organizationId, req.user, dto.plan);
  }

  @Post('start-trial')
  @Permissions('subscription.manage')
  startTrial(@Request() req) {
    return this.subscriptions.startTrial(req.user.organizationId, req.user);
  }

  /** Super Admin only: set any org's status/plan for support (cross-tenant). */
  @Patch('admin/:orgId')
  @Permissions('admin.view')
  adminSet(@Request() req, @Param('orgId') orgId: string, @Body() dto: AdminSubscriptionDto) {
    assertUuid(orgId, 'orgId');
    return this.subscriptions.adminSet(orgId, req.user, dto);
  }
}
