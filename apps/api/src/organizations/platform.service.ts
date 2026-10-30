import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const DAY = 86_400_000;

/** Real cross-organization metrics for the founder panel (no sample data). */
@Injectable()
export class PlatformService {
  constructor(private prisma: PrismaService) {}

  async metrics() {
    const now = Date.now();
    const since30 = new Date(now - 30 * DAY);
    const since7 = new Date(now - 7 * DAY);

    const [
      organizations,
      activeOrganizations,
      newOrganizations30d,
      users,
      activeUsers30d,
      activeUsers7d,
      patients,
      appointments30d,
      invoices30d,
      bySubscription,
    ] = await Promise.all([
      this.prisma.organization.count(),
      this.prisma.organization.count({ where: { status: 'ACTIVE' } }),
      this.prisma.organization.count({ where: { createdAt: { gte: since30 } } }),
      this.prisma.user.count({ where: { status: 'ACTIVE' } }),
      this.prisma.user.count({ where: { status: 'ACTIVE', lastLoginAt: { gte: since30 } } }),
      this.prisma.user.count({ where: { status: 'ACTIVE', lastLoginAt: { gte: since7 } } }),
      this.prisma.patient.count(),
      this.prisma.appointment.count({ where: { scheduledStart: { gte: since30 } } }),
      this.prisma.invoice.count({ where: { createdAt: { gte: since30 } } }),
      this.prisma.organization.groupBy({ by: ['subscriptionStatus'], _count: { _all: true } }),
    ]);

    // Per-organization activity for the 25 most recently created clinics.
    const recent = await this.prisma.organization.findMany({
      orderBy: { createdAt: 'desc' },
      take: 25,
      select: {
        id: true,
        name: true,
        slug: true,
        status: true,
        subscriptionPlan: true,
        subscriptionStatus: true,
        createdAt: true,
        _count: { select: { users: true, patients: true, branches: true } },
      },
    });
    const ids = recent.map((o) => o.id);
    const [apptCounts, lastLogins] = await Promise.all([
      this.prisma.appointment.groupBy({
        by: ['organizationId'],
        where: { organizationId: { in: ids }, scheduledStart: { gte: since30 } },
        _count: { _all: true },
      }),
      this.prisma.user.groupBy({
        by: ['organizationId'],
        where: { organizationId: { in: ids } },
        _max: { lastLoginAt: true },
      }),
    ]);
    const appts = new Map(apptCounts.map((a) => [a.organizationId, a._count._all]));
    const logins = new Map(lastLogins.map((l) => [l.organizationId, l._max.lastLoginAt]));

    return {
      generatedAt: new Date(now).toISOString(),
      totals: {
        organizations,
        activeOrganizations,
        newOrganizations30d,
        activeUsers: users,
        usersActive30d: activeUsers30d,
        usersActive7d: activeUsers7d,
        patients,
        appointments30d,
        invoices30d,
      },
      subscriptions: bySubscription.map((s) => ({ status: s.subscriptionStatus, count: s._count._all })),
      organizations: recent.map((o) => ({
        id: o.id,
        name: o.name,
        slug: o.slug,
        status: o.status,
        subscriptionPlan: o.subscriptionPlan,
        subscriptionStatus: o.subscriptionStatus,
        createdAt: o.createdAt,
        users: o._count.users,
        patients: o._count.patients,
        branches: o._count.branches,
        appointments30d: appts.get(o.id) ?? 0,
        lastLoginAt: logins.get(o.id) ?? null,
      })),
    };
  }
}
