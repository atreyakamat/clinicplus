import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TenantAssertService } from '../common/tenant/tenant-assert.service';
import { AuditService } from '../common/services/audit.service';
import { pageArgs, paginated } from '../common/pagination';
import { assertUuid } from '../common/validation/uuid';
import { normalizePermission } from '../auth/access.utils';
import {
  CreateTaskCommentDto,
  CreateTaskDto,
  ListTasksQueryDto,
  UpdateTaskDto,
} from './dto/task.dto';

/** The subset of req.user the task rules depend on. */
export interface TaskActor {
  id: string;
  organizationId: string;
  branchId: string;
  orgWide?: boolean;
  permissions?: string[];
}

export function actorCan(actor: TaskActor, permission: string) {
  const wanted = normalizePermission(permission);
  return (actor.permissions ?? []).some((p) => normalizePermission(p) === wanted);
}

const TASK_INCLUDE = {
  assignee: { select: { id: true, firstName: true, lastName: true } },
  patient: { select: { id: true, firstName: true, lastName: true, phone: true } },
  _count: { select: { comments: true } },
} satisfies Prisma.TaskInclude;

@Injectable()
export class TasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantAssertService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Holders of tasks.assign (managers / admins) see every task in the active
   * branch; everybody else only sees tasks assigned to them or created by them.
   */
  private visibility(actor: TaskActor): Prisma.TaskWhereInput {
    if (actorCan(actor, 'tasks.assign')) return {};
    return { OR: [{ assignedTo: actor.id }, { createdBy: actor.id }] };
  }

  private async resolveAssignee(actor: TaskActor, assignedTo: string | null | undefined) {
    if (assignedTo === undefined || assignedTo === null) return assignedTo;
    if (assignedTo !== actor.id && !actorCan(actor, 'tasks.assign')) {
      throw new ForbiddenException('You need the tasks.assign permission to assign tasks to other staff');
    }
    await this.tenant.user(assignedTo, actor.organizationId, { label: 'Assignee' });
    return assignedTo;
  }

  async create(dto: CreateTaskDto, actor: TaskActor) {
    let assignedTo = await this.resolveAssignee(actor, dto.assignedTo);
    // Without tasks.assign a task is always yours.
    if (assignedTo === undefined && !actorCan(actor, 'tasks.assign')) assignedTo = actor.id;
    if (dto.patientId) await this.tenant.patient(dto.patientId, actor.organizationId);

    return this.prisma.task.create({
      data: {
        organizationId: actor.organizationId,
        branchId: actor.branchId,
        title: dto.title,
        description: dto.description,
        assignedTo: assignedTo ?? null,
        patientId: dto.patientId,
        priority: dto.priority ?? 'MEDIUM',
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
        sourceType: 'MANUAL',
        createdBy: actor.id,
        updatedBy: actor.id,
      },
      include: TASK_INCLUDE,
    });
  }

  async findAll(query: ListTasksQueryDto, actor: TaskActor) {
    const { page, limit, skip, take } = pageArgs(query);
    const scope = query.scope === 'all' && actorCan(actor, 'tasks.assign') ? 'all' : 'mine';
    if (query.assignedTo) assertUuid(query.assignedTo, 'assignedTo');

    const and: Prisma.TaskWhereInput[] = [this.visibility(actor)];
    if (scope === 'mine') and.push({ OR: [{ assignedTo: actor.id }, { createdBy: actor.id }] });
    if (query.status) and.push({ status: query.status });
    else if (!query.includeClosed) and.push({ status: { in: ['OPEN', 'IN_PROGRESS'] } });
    if (query.overdue) {
      and.push({ dueDate: { lt: new Date() }, status: { in: ['OPEN', 'IN_PROGRESS'] } });
    }

    const where: Prisma.TaskWhereInput = {
      organizationId: actor.organizationId,
      branchId: actor.branchId,
      deletedAt: null,
      ...(query.priority ? { priority: query.priority } : {}),
      ...(query.assignedTo ? { assignedTo: query.assignedTo } : {}),
      ...(query.patientId ? { patientId: query.patientId } : {}),
      ...(query.sourceType ? { sourceType: query.sourceType } : {}),
      AND: and,
    };

    const [items, total] = await Promise.all([
      this.prisma.task.findMany({
        where,
        include: TASK_INCLUDE,
        orderBy: [{ dueDate: { sort: 'asc', nulls: 'last' } }, { createdAt: 'desc' }],
        skip,
        take,
      }),
      this.prisma.task.count({ where }),
    ]);
    return paginated(items, total, page, limit);
  }

  /** Counts for the dashboard header, respecting the same visibility rules. */
  async summary(actor: TaskActor, scope: 'mine' | 'all' = 'mine') {
    const effective = scope === 'all' && actorCan(actor, 'tasks.assign') ? 'all' : 'mine';
    const base: Prisma.TaskWhereInput = {
      organizationId: actor.organizationId,
      branchId: actor.branchId,
      deletedAt: null,
      AND: [
        this.visibility(actor),
        ...(effective === 'mine' ? [{ OR: [{ assignedTo: actor.id }, { createdBy: actor.id }] }] : []),
      ],
    };
    const now = new Date();
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);
    const [open, inProgress, overdue, urgent, completedToday] = await Promise.all([
      this.prisma.task.count({ where: { ...base, status: 'OPEN' } }),
      this.prisma.task.count({ where: { ...base, status: 'IN_PROGRESS' } }),
      this.prisma.task.count({ where: { ...base, status: { in: ['OPEN', 'IN_PROGRESS'] }, dueDate: { lt: now } } }),
      this.prisma.task.count({ where: { ...base, status: { in: ['OPEN', 'IN_PROGRESS'] }, priority: 'URGENT' } }),
      this.prisma.task.count({ where: { ...base, status: 'COMPLETED', completedAt: { gte: startOfDay } } }),
    ]);
    return { scope: effective, open, inProgress, overdue, urgent, completedToday };
  }

  async findOne(id: string, actor: TaskActor) {
    assertUuid(id, 'taskId');
    const task = await this.prisma.task.findFirst({
      where: {
        id,
        organizationId: actor.organizationId,
        branchId: actor.branchId,
        deletedAt: null,
        ...this.visibility(actor),
      },
      include: TASK_INCLUDE,
    });
    if (!task) throw new NotFoundException('Task not found');
    return task;
  }

  async update(id: string, dto: UpdateTaskDto, actor: TaskActor) {
    const before = await this.findOne(id, actor);
    const data: Prisma.TaskUncheckedUpdateInput = { updatedBy: actor.id };

    if (dto.title !== undefined) data.title = dto.title;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.priority !== undefined) data.priority = dto.priority;
    if (dto.dueDate !== undefined) data.dueDate = dto.dueDate ? new Date(dto.dueDate) : null;
    if (dto.patientId !== undefined) {
      if (dto.patientId) await this.tenant.patient(dto.patientId, actor.organizationId);
      data.patientId = dto.patientId;
    }
    if (dto.assignedTo !== undefined && dto.assignedTo !== before.assignedTo) {
      if (dto.assignedTo === null && !actorCan(actor, 'tasks.assign')) {
        throw new ForbiddenException('You need the tasks.assign permission to unassign tasks');
      }
      data.assignedTo = await this.resolveAssignee(actor, dto.assignedTo);
    }
    if (dto.status !== undefined && dto.status !== before.status) {
      data.status = dto.status;
      data.completedAt = dto.status === 'COMPLETED' ? new Date() : null;
    }

    const task = await this.prisma.task.update({ where: { id }, data, include: TASK_INCLUDE });
    if (data.assignedTo !== undefined || data.status !== undefined) {
      await this.audit.log({
        organizationId: actor.organizationId,
        userId: actor.id,
        action: data.assignedTo !== undefined ? 'TASK_REASSIGNED' : 'TASK_STATUS_CHANGED',
        resource: 'Task',
        resourceId: id,
        beforeData: { status: before.status, assignedTo: before.assignedTo },
        afterData: { status: task.status, assignedTo: task.assignedTo },
      });
    }
    return task;
  }

  async remove(id: string, actor: TaskActor) {
    const before = await this.findOne(id, actor);
    const task = await this.prisma.task.update({
      where: { id },
      data: { status: 'CANCELLED', deletedAt: new Date(), deletedBy: actor.id, updatedBy: actor.id },
    });
    await this.audit.log({
      organizationId: actor.organizationId,
      userId: actor.id,
      action: 'TASK_DELETED',
      resource: 'Task',
      resourceId: id,
      beforeData: { title: before.title, status: before.status },
    });
    return task;
  }

  async listComments(id: string, actor: TaskActor) {
    await this.findOne(id, actor);
    return this.prisma.taskComment.findMany({
      where: { taskId: id, organizationId: actor.organizationId },
      include: { user: { select: { id: true, firstName: true, lastName: true } } },
      orderBy: { createdAt: 'asc' },
    });
  }

  async addComment(id: string, dto: CreateTaskCommentDto, actor: TaskActor) {
    const task = await this.findOne(id, actor);
    return this.prisma.taskComment.create({
      data: {
        organizationId: actor.organizationId,
        branchId: task.branchId,
        taskId: id,
        userId: actor.id,
        comment: dto.comment,
      },
      include: { user: { select: { id: true, firstName: true, lastName: true } } },
    });
  }

  /** Active staff of the active branch, for assignee pickers (tasks.assign holders only). */
  async assignees(actor: TaskActor) {
    const users = await this.prisma.user.findMany({
      where: { organizationId: actor.organizationId, branchId: actor.branchId, status: 'ACTIVE', deletedAt: null },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        roles: { select: { role: { select: { name: true } } } },
      },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    });
    return users
      .map((u) => ({
        id: u.id,
        firstName: u.firstName,
        lastName: u.lastName,
        roles: u.roles.map((r) => r.role.name),
      }))
      .filter((u) => !u.roles.includes('Patient'));
  }
}
