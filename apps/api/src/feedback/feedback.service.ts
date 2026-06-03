import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class FeedbackService {
  constructor(private prisma: PrismaService) {}

  async create(data: any, organizationId: string, branchId: string, userId: string) {
    return this.prisma.feedback.create({
      data: {
        ...data,
        organizationId,
        branchId,
        userId,
      }
    });
  }

  async findAll(organizationId: string, branchId: string) {
    return this.prisma.feedback.findMany({
      where: { organizationId, branchId },
      include: { user: { select: { firstName: true, lastName: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async updateStatus(id: string, status: string, organizationId: string, branchId: string) {
    // Verify feedback belongs to org/branch first
    await this.findOne(id, organizationId, branchId);
    
    return this.prisma.feedback.update({
      where: { id },
      data: { status }
    });
  }

  async findOne(id: string, organizationId: string, branchId: string) {
    const feedback = await this.prisma.feedback.findUnique({
      where: { id, organizationId, branchId },
      include: { user: { select: { firstName: true, lastName: true } } },
    });
    if (!feedback) {
      throw new NotFoundException(`Feedback with ID ${id} not found`);
    }
    return feedback;
  }
}
