import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class TasksService {
  constructor(private prisma: PrismaService) {}

  async create(data: Prisma.TaskUncheckedCreateInput, organizationId: string, branchId: string, createdBy: string) {
    return this.prisma.task.create({
      data: {
        ...data,
        organizationId,
        branchId,
        createdBy,
      },
    });
  }

  async findAll(organizationId: string, branchId: string) {
    return this.prisma.task.findMany({
      where: {
        organizationId,
        branchId,
      },
      include: {
        assignee: {
          select: { id: true, firstName: true, lastName: true }
        },
        patient: {
          select: { id: true, firstName: true, lastName: true }
        }
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async findOne(id: string, organizationId: string, branchId: string) {
    const task = await this.prisma.task.findUnique({
      where: { id, organizationId, branchId },
      include: {
        assignee: {
          select: { id: true, firstName: true, lastName: true }
        },
        patient: {
          select: { id: true, firstName: true, lastName: true }
        }
      },
    });
    if (!task) {
      throw new NotFoundException(`Task with ID ${id} not found`);
    }
    return task;
  }

  async update(id: string, data: Prisma.TaskUpdateInput, organizationId: string, branchId: string) {
    // Verify task belongs to org/branch first
    await this.findOne(id, organizationId, branchId);
    
    return this.prisma.task.update({
      where: { id },
      data: {
        ...data,
        updatedBy: data.updatedBy || '', // This should come from context in real implementation
      },
    });
  }

  async remove(id: string, organizationId: string, branchId: string) {
    // Verify task belongs to org/branch first
    await this.findOne(id, organizationId, branchId);
    
    // Soft delete
    return this.prisma.task.update({
      where: { id },
      data: {
        status: 'CANCELLED',
        deletedAt: new Date(),
      },
    });
  }
}
