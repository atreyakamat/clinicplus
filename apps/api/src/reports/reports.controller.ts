import { BadRequestException, Controller, Get, Param, Query, Request, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { stringify } from 'csv-stringify/sync';
import { csvSafeRows } from '../common/csv';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { AuditService } from '../common/services/audit.service';
import { ReportsService } from './reports.service';
import { REPORT_NAMES, ReportQueryDto } from './reports.dto';

/** Financial reports. Branch-scoped; `scope=org` consolidates all branches for org-wide roles. */
@Controller('api/v1/reports')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class ReportsController {
  constructor(
    private readonly reports: ReportsService,
    private readonly audit: AuditService,
  ) {}

  @Get('outstanding')
  @Permissions('reports.view')
  async outstanding(@Query() q: ReportQueryDto, @Request() req) {
    return this.reports.outstanding(await this.reports.scope(req.user, q), q);
  }

  @Get('ageing')
  @Permissions('reports.view')
  async ageing(@Query() q: ReportQueryDto, @Request() req) {
    return this.reports.ageing(await this.reports.scope(req.user, q));
  }

  @Get('daily-close')
  @Permissions('reports.view')
  async dailyClose(@Query() q: ReportQueryDto, @Request() req) {
    return this.reports.dailyClose(await this.reports.scope(req.user, q), q);
  }

  @Get('revenue')
  @Permissions('reports.view')
  async revenue(@Query() q: ReportQueryDto, @Request() req) {
    return this.reports.revenue(await this.reports.scope(req.user, q), q);
  }

  @Get(':report/export')
  @Permissions('reports.view', 'reports.export')
  async export(@Param('report') report: string, @Query() q: ReportQueryDto, @Request() req, @Res() res: Response) {
    if (!(REPORT_NAMES as readonly string[]).includes(report)) throw new BadRequestException('Unknown report');
    const scope = await this.reports.scope(req.user, q);
    const { filename, rows } = await this.reports.csvRows(report, scope, q);
    const csv = rows.length ? stringify(csvSafeRows(rows), { header: true }) : 'No data\n';
    await this.audit.log({
      organizationId: req.user.organizationId,
      userId: req.user.id,
      action: 'REPORT_EXPORTED',
      resource: 'report',
      resourceId: null,
      afterData: { report, scope: scope.branchId ? 'branch' : 'org', rows: rows.length, from: q.from, to: q.to, date: q.date },
    });
    res.set({
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    });
    res.send(csv);
  }
}
