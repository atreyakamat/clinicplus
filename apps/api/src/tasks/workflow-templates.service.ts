import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TenantAssertService } from '../common/tenant/tenant-assert.service';
import { AuditService } from '../common/services/audit.service';
import { TimelineService } from '../timeline/timeline.service';
import { assertUuid } from '../common/validation/uuid';
import {
  CreateWorkflowTemplateDto,
  StartWorkflowDto,
  UpdateWorkflowTemplateDto,
  WorkflowStepDto,
} from './dto/workflow.dto';
import { TaskActor } from './tasks.service';
import { TASK_SOURCE, TaskAutomationService } from './task-automation.service';

export interface WorkflowStep {
  title: string;
  description?: string;
  offsetDays: number;
  assigneeRole?: string;
  priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
}

const toSteps = (steps: WorkflowStepDto[]): WorkflowStep[] =>
  steps.map((s) => ({
    title: s.title,
    ...(s.description ? { description: s.description } : {}),
    offsetDays: s.offsetDays,
    ...(s.assigneeRole ? { assigneeRole: s.assigneeRole } : {}),
    ...(s.priority ? { priority: s.priority } : {}),
  }));

@Injectable()
export class WorkflowTemplatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantAssertService,
    private readonly audit: AuditService,
    private readonly timeline: TimelineService,
    private readonly automation: TaskAutomationService,
  ) {}

  /** Templates of the organization that apply to the active branch (branch-specific or org-wide). */
  findAll(actor: TaskActor, includeInactive = false) {
    return this.prisma.workflowTemplate.findMany({
      where: {
        organizationId: actor.organizationId,
        deletedAt: null,
        OR: [{ branchId: null }, { branchId: actor.branchId }],
        ...(includeInactive ? {} : { status: 'ACTIVE' }),
      },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string, actor: TaskActor) {
    assertUuid(id, 'workflowTemplateId');
    const row = await this.prisma.workflowTemplate.findFirst({
      where: {
        id,
        organizationId: actor.organizationId,
        deletedAt: null,
        OR: [{ branchId: null }, { branchId: actor.branchId }],
      },
    });
    if (!row) throw new NotFoundException('Workflow template not found');
    return row;
  }

  async create(dto: CreateWorkflowTemplateDto, actor: TaskActor) {
    const row = await this.prisma.workflowTemplate.create({
      data: {
        organizationId: actor.organizationId,
        branchId: actor.branchId,
        name: dto.name,
        description: dto.description,
        trigger: dto.trigger ?? 'MANUAL',
        steps: toSteps(dto.steps) as unknown as Prisma.InputJsonValue,
        createdBy: actor.id,
        updatedBy: actor.id,
      },
    });
    await this.audit.log({
      organizationId: actor.organizationId,
      userId: actor.id,
      action: 'WORKFLOW_TEMPLATE_CREATED',
      resource: 'WorkflowTemplate',
      resourceId: row.id,
      afterData: { name: row.name, steps: dto.steps.length },
    });
    return row;
  }

  async update(id: string, dto: UpdateWorkflowTemplateDto, actor: TaskActor) {
    await this.findOne(id, actor);
    return this.prisma.workflowTemplate.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.trigger !== undefined ? { trigger: dto.trigger } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
        ...(dto.steps !== undefined ? { steps: toSteps(dto.steps) as unknown as Prisma.InputJsonValue } : {}),
        updatedBy: actor.id,
      },
    });
  }

  async remove(id: string, actor: TaskActor) {
    const before = await this.findOne(id, actor);
    await this.prisma.workflowTemplate.update({
      where: { id },
      data: { status: 'INACTIVE', deletedAt: new Date(), deletedBy: actor.id },
    });
    await this.audit.log({
      organizationId: actor.organizationId,
      userId: actor.id,
      action: 'WORKFLOW_TEMPLATE_DELETED',
      resource: 'WorkflowTemplate',
      resourceId: id,
      beforeData: { name: before.name },
    });
    return { id, deleted: true };
  }

  /** Creates one task per step for the patient; assignees are resolved by role within the active branch. */
  async start(id: string, dto: StartWorkflowDto, actor: TaskActor) {
    const template = await this.findOne(id, actor);
    if (template.status !== 'ACTIVE') throw new BadRequestException('Workflow template is inactive');
    const steps = (Array.isArray(template.steps) ? template.steps : []) as unknown as WorkflowStep[];
    if (!steps.length) throw new BadRequestException('Workflow template has no steps');
    const patient = await this.tenant.patient(dto.patientId, actor.organizationId);
    const start = dto.startDate ? new Date(dto.startDate) : new Date();

    const tasks = await this.prisma.$transaction(async (tx) => {
      const created: Prisma.TaskGetPayload<object>[] = [];
      for (const step of steps) {
        const assignee = step.assigneeRole
          ? await this.automation.findUserForRoles(tx, actor.organizationId, actor.branchId, [step.assigneeRole])
          : null;
        const due = new Date(start.getTime() + (Number(step.offsetDays) || 0) * 24 * 3600_000);
        created.push(
          await tx.task.create({
            data: {
              organizationId: actor.organizationId,
              branchId: actor.branchId,
              title: step.title,
              description: [step.description, `Workflow: ${template.name}`].filter(Boolean).join('\n'),
              patientId: patient.id,
              assignedTo: assignee?.id ?? null,
              priority: step.priority ?? 'MEDIUM',
              dueDate: due,
              sourceType: TASK_SOURCE.WORKFLOW,
              sourceId: template.id,
              createdBy: actor.id,
              updatedBy: actor.id,
            },
          }),
        );
      }
      await this.timeline.record(
        {
          organizationId: actor.organizationId,
          patientId: patient.id,
          eventType: 'WORKFLOW_STARTED',
          eventCategory: 'TASK',
          title: `Workflow started: ${template.name}`,
          description: `${created.length} task(s) created`,
          metadata: { workflowTemplateId: template.id, taskIds: created.map((t) => t.id) },
          createdBy: actor.id,
        },
        tx,
      );
      return created;
    });

    return {
      workflowTemplateId: template.id,
      patientId: patient.id,
      tasks,
      unassigned: tasks.filter((t) => !t.assignedTo).length,
    };
  }
}
