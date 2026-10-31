import { Controller, Get, HttpCode, Post, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/services/audit.service';
import { NotificationService } from './notification.service';

const AUTOMATION_PREFIXES: Record<string, string> = {
  bookingConfirmations: 'confirm:',
  cancellationNotices: 'cancel:',
  reminders24h: 'remind24:',
  reminders2h: 'remind2:',
  followUpsDue: 'fu-due:',
  followUpsOverdue: 'fu-overdue:',
  campaigns: 'campaign:',
};

@Controller('api/v1/messages/automations')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class AutomationsController {
  constructor(
    private readonly notifications: NotificationService,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Scheduler state + this organization's automated messages in the last 7 days. */
  @Get('status')
  @Permissions('messages.view')
  async status(@Request() req) {
    const since = new Date(Date.now() - 7 * 86_400_000);
    const organizationId = req.user.organizationId;
    const last7Days: Record<string, number> = {};
    await Promise.all(
      Object.entries(AUTOMATION_PREFIXES).map(async ([name, prefix]) => {
        last7Days[name] = await this.prisma.message.count({
          where: { organizationId, branchId: req.user.branchId, reminderKey: { startsWith: prefix }, createdAt: { gte: since } },
        });
      }),
    );
    return {
      schedulerActive: this.notifications.schedulerActive,
      lastScheduledRun: this.notifications.lastRun
        ? { startedAt: this.notifications.lastRun.startedAt, finishedAt: this.notifications.lastRun.finishedAt, errors: this.notifications.lastRun.errors.length }
        : null,
      last7Days,
    };
  }

  /** Runs every automation now for the caller's organization (idempotent). */
  @Post('run')
  @HttpCode(200)
  @Permissions('campaigns.manage')
  async run(@Request() req) {
    const result = await this.notifications.runAll(req.user.organizationId);
    await this.audit.log({
      organizationId: req.user.organizationId,
      userId: req.user.id,
      action: 'MESSAGING_AUTOMATIONS_RUN',
      resource: 'Message',
      afterData: { results: result.results, errors: result.errors },
    });
    return result;
  }
}
