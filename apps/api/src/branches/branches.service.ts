import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/services/audit.service';
import { SubscriptionService } from '../subscription/subscription.service';
import { assertUuid } from '../common/validation/uuid';
import { isValidTimezone } from '../clinic-settings/timezone';
import type { ReqUser } from '../clinic-settings/request-user';
import { CreateBranchDto, ListBranchesQueryDto, UpdateBranchDto } from './dto';

/**
 * Branches of the caller's organization. Org-wide users (Owner / Clinic Admin /
 * Super Admin) see and manage every branch; branch-level users only see their
 * own home branch.
 */
@Injectable()
export class BranchesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
    // Injectable because SubscriptionModule is @Global.
    private readonly subscriptions: SubscriptionService,
  ) {}

  private withCounts = {
    _count: { select: { users: { where: { status: 'ACTIVE' as const } }, departments: { where: { status: 'ACTIVE' as const } } } },
  };

  async list(user: ReqUser, q: ListBranchesQueryDto) {
    const where: Prisma.BranchWhereInput = {
      organizationId: user.organizationId,
      ...(q.includeArchived === 'true' ? {} : { status: { not: 'ARCHIVED' } }),
      ...(user.orgWide ? {} : { id: user.homeBranchId }),
    };
    return this.prisma.branch.findMany({ where, orderBy: [{ createdAt: 'asc' }], include: this.withCounts });
  }

  async get(user: ReqUser, id: string) {
    assertUuid(id, 'id');
    if (!user.orgWide && id !== user.homeBranchId) throw new NotFoundException('Branch not found');
    const row = await this.prisma.branch.findFirst({
      where: { id, organizationId: user.organizationId },
      include: this.withCounts,
    });
    if (!row) throw new NotFoundException('Branch not found');
    return row;
  }

  private timezone(tz?: string) {
    if (tz === undefined) return undefined;
    if (!isValidTimezone(tz)) throw new BadRequestException(`Unknown timezone "${tz}"`);
    return tz;
  }

  async create(user: ReqUser, dto: CreateBranchDto) {
    if (!user.orgWide) throw new ForbiddenException('Only organization-wide administrators can create branches');
    // Plan enforcement: block a new branch once the clinic's plan limit is hit.
    await this.subscriptions.assertCanAdd(user.organizationId, 'branch');
    await this.assertUniqueName(user.organizationId, dto.name);
    const branch = await this.prisma.branch.create({
      data: {
        ...dto,
        name: dto.name.trim(),
        timezone: this.timezone(dto.timezone) ?? this.config.get<string>('DEFAULT_TIMEZONE') ?? 'Asia/Kolkata',
        organizationId: user.organizationId,
        createdBy: user.id,
      },
    });
    await this.audit.log({
      organizationId: user.organizationId,
      userId: user.id,
      action: 'CREATE',
      resource: 'branch',
      resourceId: branch.id,
      afterData: branch,
    });
    return branch;
  }

  async update(user: ReqUser, id: string, dto: UpdateBranchDto) {
    const existing = await this.get(user, id);
    if (dto.status && !user.orgWide) {
      throw new ForbiddenException('Only organization-wide administrators can change branch status');
    }
    if (dto.name && dto.name.trim().toLowerCase() !== existing.name.toLowerCase()) {
      await this.assertUniqueName(user.organizationId, dto.name, id);
    }
    const { status, timezone, ...rest } = dto;
    const branch = await this.prisma.branch.update({
      where: { id: existing.id },
      data: {
        ...rest,
        ...(rest.name ? { name: rest.name.trim() } : {}),
        ...(timezone !== undefined ? { timezone: this.timezone(timezone) } : {}),
        ...(status ? { status, deletedAt: null, deletedBy: null } : {}),
        updatedBy: user.id,
      },
    });
    await this.audit.log({
      organizationId: user.organizationId,
      userId: user.id,
      action: 'UPDATE',
      resource: 'branch',
      resourceId: branch.id,
      beforeData: existing,
      afterData: branch,
    });
    return branch;
  }

  async archive(user: ReqUser, id: string) {
    if (!user.orgWide) throw new ForbiddenException('Only organization-wide administrators can archive branches');
    const existing = await this.get(user, id);
    if (existing.status === 'ARCHIVED') return existing;
    const activeBranches = await this.prisma.branch.count({
      where: { organizationId: user.organizationId, status: 'ACTIVE', id: { not: id } },
    });
    if (activeBranches === 0) throw new ConflictException('Cannot archive the last active branch');
    const staff = await this.prisma.user.count({
      where: { organizationId: user.organizationId, branchId: id, status: 'ACTIVE' },
    });
    if (staff > 0) {
      throw new ConflictException(
        `Branch still has ${staff} active staff member(s) assigned; move or deactivate them first`,
      );
    }
    const branch = await this.prisma.branch.update({
      where: { id },
      data: { status: 'ARCHIVED', deletedAt: new Date(), deletedBy: user.id },
    });
    await this.audit.log({
      organizationId: user.organizationId,
      userId: user.id,
      action: 'ARCHIVE',
      resource: 'branch',
      resourceId: id,
      beforeData: existing,
      afterData: branch,
    });
    return branch;
  }

  private async assertUniqueName(organizationId: string, name: string, exceptId?: string) {
    const dup = await this.prisma.branch.findFirst({
      where: {
        organizationId,
        status: { not: 'ARCHIVED' },
        name: { equals: name.trim(), mode: 'insensitive' },
        ...(exceptId ? { id: { not: exceptId } } : {}),
      },
      select: { id: true },
    });
    if (dup) throw new ConflictException(`A branch named "${name.trim()}" already exists`);
  }
}
