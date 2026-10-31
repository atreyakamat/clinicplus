import { BadRequestException, Controller, Get, Query, Request, UseGuards } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { IsISO8601, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { PaginationQueryDto, pageArgs, paginated } from '../common/pagination';

class AuditQueryDto extends PaginationQueryDto {
  @IsOptional() @IsUUID()
  actorId?: string;

  @IsOptional() @IsString() @MaxLength(60)
  entityType?: string;

  @IsOptional() @IsString() @MaxLength(60)
  action?: string;

  @IsOptional() @IsString() @MaxLength(64)
  entityId?: string;

  /** Inclusive lower bound (ISO date or date-time). */
  @IsOptional() @IsISO8601()
  from?: string;

  /** Upper bound; a bare date (YYYY-MM-DD) includes that whole day. */
  @IsOptional() @IsISO8601()
  to?: string;
}

@Controller('api/v1/audit-logs')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class AuditLogsController {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Organization-wide actors see the whole tenant's trail; branch-level actors
   * (Branch Manager) only see entries made by staff of their home branch.
   */
  private async scope(req: any): Promise<Prisma.AuditLogWhereInput> {
    const base: Prisma.AuditLogWhereInput = { organizationId: req.user.organizationId };
    if (req.user.orgWide) return base;
    const staff = await this.prisma.user.findMany({
      where: { organizationId: req.user.organizationId, branchId: req.user.homeBranchId ?? req.user.branchId },
      select: { id: true },
    });
    return { ...base, OR: [{ branchId: req.user.homeBranchId ?? req.user.branchId }, { actorId: { in: staff.map((s) => s.id) } }] };
  }

  @Get()
  @Permissions('audit.view')
  async list(@Query() q: AuditQueryDto, @Request() req) {
    const { page, limit, skip, take } = pageArgs(q);
    const createdAt: Prisma.DateTimeFilter = {};
    if (q.from) createdAt.gte = new Date(q.from);
    if (q.to) {
      const to = new Date(q.to);
      if (/^\d{4}-\d{2}-\d{2}$/.test(q.to)) to.setUTCDate(to.getUTCDate() + 1);
      createdAt.lt = to;
    }
    if (createdAt.gte && createdAt.lt && createdAt.gte >= createdAt.lt) {
      throw new BadRequestException('"from" must be before "to"');
    }
    const where: Prisma.AuditLogWhereInput = {
      AND: [
        await this.scope(req),
        {
          ...(q.actorId ? { actorId: q.actorId } : {}),
          ...(q.entityType ? { entityType: q.entityType } : {}),
          ...(q.action ? { action: q.action } : {}),
          ...(q.entityId ? { entityId: q.entityId } : {}),
          ...(q.from || q.to ? { createdAt } : {}),
        },
      ],
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take }),
      this.prisma.auditLog.count({ where }),
    ]);
    const actorIds = Array.from(new Set(items.map((i) => i.actorId).filter((v): v is string => !!v)));
    const actors = actorIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: actorIds }, organizationId: req.user.organizationId },
          select: { id: true, firstName: true, lastName: true, email: true },
        })
      : [];
    const byId = new Map(actors.map((a) => [a.id, a]));
    return paginated(
      items.map((i) => ({ ...i, actor: i.actorId ? byId.get(i.actorId) ?? null : null })),
      total,
      page,
      limit,
    );
  }

  /** Distinct actions and entity types present in the tenant's trail (filter dropdowns). */
  @Get('facets')
  @Permissions('audit.view')
  async facets(@Request() req) {
    const where = await this.scope(req);
    const [actions, entityTypes] = await Promise.all([
      this.prisma.auditLog.findMany({ where, distinct: ['action'], select: { action: true }, orderBy: { action: 'asc' }, take: 200 }),
      this.prisma.auditLog.findMany({ where, distinct: ['entityType'], select: { entityType: true }, orderBy: { entityType: 'asc' }, take: 200 }),
    ]);
    return {
      actions: actions.map((a) => a.action),
      entityTypes: entityTypes.map((e) => e.entityType).filter(Boolean),
    };
  }
}
