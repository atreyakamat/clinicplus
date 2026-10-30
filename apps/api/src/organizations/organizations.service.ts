import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/services/audit.service';
import { UpdateBrandingDto, UpdateOrganizationDto } from './dto/update-organization.dto';

const ORG_SELECT = {
  id: true,
  name: true,
  legalName: true,
  slug: true,
  logoUrl: true,
  website: true,
  email: true,
  phone: true,
  primaryColor: true,
  secondaryColor: true,
  letterheadUrl: true,
  footerText: true,
  watermarkUrl: true,
  subscriptionPlan: true,
  subscriptionStatus: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  branches: {
    where: { status: 'ACTIVE' as const },
    select: { id: true, name: true, code: true, city: true, timezone: true, phone: true, email: true, address: true, status: true },
    orderBy: { createdAt: 'asc' as const },
  },
};

/** Normalises '' to null so optional profile fields can be cleared. */
function clean<T extends object>(dto: T) {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(dto)) {
    if (v === undefined) continue;
    out[k] = v === '' ? null : v;
  }
  return out;
}

@Injectable()
export class OrganizationsService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  /** Tenant-scoped read: an id other than the caller's organization is reported as not found. */
  async findOne(id: string, organizationId?: string) {
    if (organizationId && id !== organizationId) {
      throw new NotFoundException('Organization not found');
    }
    const org = await this.prisma.organization.findFirst({
      where: { id: organizationId ?? id },
      select: ORG_SELECT,
    });
    if (!org) throw new NotFoundException('Organization not found');
    return org;
  }

  async update(id: string, dto: UpdateOrganizationDto | UpdateBrandingDto, organizationId: string, actorId?: string) {
    const before = await this.findOne(id, organizationId);
    const data = clean(dto);
    if (data.name === null) delete data.name;
    if (data.primaryColor === null) delete data.primaryColor;
    if (data.secondaryColor === null) delete data.secondaryColor;
    await this.prisma.organization.update({
      where: { id: organizationId },
      data: { ...data, updatedBy: actorId },
    });
    const after = await this.findOne(id, organizationId);
    const pick = (o: any) => Object.fromEntries(Object.keys(data).map((k) => [k, o[k]]));
    await this.audit.log({
      organizationId,
      userId: actorId,
      action: 'UPDATE',
      resource: 'organization',
      resourceId: organizationId,
      beforeData: pick(before),
      afterData: pick(after),
    });
    return after;
  }
}
