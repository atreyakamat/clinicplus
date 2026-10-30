import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TenantAssertService } from '../common/tenant/tenant-assert.service';
import { pageArgs, paginated } from '../common/pagination';
import { RequestUser, userCan } from '../clinical/clinical-access';
import {
  CATEGORY_PERMISSIONS,
  SUPERSEDED_SYSTEM_EVENTS,
  SYSTEM_PREFIX_CATEGORY,
  TIMELINE_CATEGORIES,
  TIMELINE_EVENTS,
  TimelineCategory,
  TimelineEventType,
} from './timeline.events';

type Db = PrismaService | Prisma.TransactionClient;

export interface TimelineRecordInput {
  organizationId: string;
  patientId: string;
  eventType: string;
  eventCategory: string;
  title: string;
  description?: string;
  metadata?: any;
  createdBy?: string;
}

@Injectable()
export class TimelineService {
  constructor(
    private prisma: PrismaService,
    private tenant: TenantAssertService,
  ) {}

  /** Low-level writer (kept for other modules). Prefer `emit` with a typed event. */
  async record(data: TimelineRecordInput, tx?: Db) {
    const db = tx || this.prisma;
    return db.timelineEvent.create({
      data: {
        organizationId: data.organizationId,
        patientId: data.patientId,
        eventType: data.eventType,
        eventCategory: data.eventCategory,
        title: data.title,
        description: data.description,
        metadata: data.metadata,
        createdBy: data.createdBy,
      },
    });
  }

  /** Records a typed event; the category is derived from the event type. */
  async emit(
    type: TimelineEventType,
    data: Omit<TimelineRecordInput, 'eventType' | 'eventCategory'>,
    tx?: Db,
  ) {
    return this.record({ ...data, eventType: type, eventCategory: TIMELINE_EVENTS[type] }, tx);
  }

  /** Categories the caller may read. */
  allowedCategories(user: RequestUser): TimelineCategory[] {
    return TIMELINE_CATEGORIES.filter((c) => {
      const perms = CATEGORY_PERMISSIONS[c];
      return perms.length === 0 || userCan(user, ...perms);
    });
  }

  private categoryWhere(categories: TimelineCategory[]): Prisma.TimelineEventWhereInput[] {
    const or: Prisma.TimelineEventWhereInput[] = [];
    for (const c of categories) {
      or.push({ eventCategory: c });
      for (const [prefix, cat] of SYSTEM_PREFIX_CATEGORY) {
        if (cat === c) or.push({ eventCategory: 'SYSTEM', eventType: { startsWith: prefix } });
      }
    }
    return or;
  }

  private effectiveCategory(eventCategory: string, eventType: string): string {
    if (eventCategory !== 'SYSTEM') return eventCategory;
    const hit = SYSTEM_PREFIX_CATEGORY.find(([p]) => eventType.startsWith(p));
    return hit ? hit[1] : 'SYSTEM';
  }

  async findForPatient(
    patientId: string,
    user: RequestUser,
    query: { category?: string; page?: number; limit?: number } = {},
  ) {
    await this.tenant.patient(patientId, user.organizationId, user.branchId);
    const allowed = this.allowedCategories(user);
    let categories = allowed;
    if (query.category) {
      const wanted = query.category.toUpperCase() as TimelineCategory;
      categories = allowed.filter((c) => c === wanted);
    }
    const { page, limit, skip, take } = pageArgs(query);
    if (categories.length === 0) return paginated([], 0, page, limit);

    const where: Prisma.TimelineEventWhereInput = {
      patientId,
      organizationId: user.organizationId,
      OR: this.categoryWhere(categories),
      NOT: { eventCategory: 'SYSTEM', eventType: { in: SUPERSEDED_SYSTEM_EVENTS } },
    };
    const [rows, total] = await Promise.all([
      this.prisma.timelineEvent.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take }),
      this.prisma.timelineEvent.count({ where }),
    ]);
    const actorIds = [...new Set(rows.map((r) => r.createdBy).filter(Boolean))] as string[];
    const actors = actorIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: actorIds }, organizationId: user.organizationId },
          select: { id: true, firstName: true, lastName: true },
        })
      : [];
    const byId = new Map(actors.map((a) => [a.id, a]));
    const items = rows.map((r) => ({
      id: r.id,
      patientId: r.patientId,
      eventType: r.eventType,
      category: this.effectiveCategory(r.eventCategory, r.eventType),
      title: r.title,
      description: r.description,
      // Generic interceptor rows stored the raw request body; never expose it.
      metadata: r.eventCategory === 'SYSTEM' ? null : r.metadata,
      createdAt: r.createdAt,
      actor: r.createdBy ? (byId.get(r.createdBy) ?? null) : null,
    }));
    return paginated(items, total, page, limit);
  }
}
