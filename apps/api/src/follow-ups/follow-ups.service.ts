import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class FollowUpsService {
  constructor(private prisma: PrismaService) {}

  async create(data: any) {
    return this.prisma.followUp.create({
      data: {
        ...data,
        organizationId: data.organizationId,
        branchId: data.branchId,
      },
    });
  }

  async findAll(organizationId: string, branchId: string) {
    return this.prisma.followUp.findMany({
      where: { organizationId, branchId },
      include: {
        patient: { select: { firstName: true, lastName: true, phone: true } },
        doctor: { select: { firstName: true, lastName: true } },
        outcomes: true,
      },
      orderBy: { scheduledDate: 'asc' },
    });
  }

  async addOutcome(followUpId: string, data: any, organizationId: string) {
    // Verify followUp belongs to org
    const followUp = await this.prisma.followUp.findUnique({
      where: { id: followUpId, organizationId },
    });
    if (!followUp) throw new NotFoundException('Follow-up not found');

    return this.prisma.followUpOutcome.create({
      data: {
        ...data,
        followUpId,
        organizationId,
        branchId: followUp.branchId,
      },
    });
  }

  async updateStatus(id: string, status: string, organizationId: string) {
    // Verify followUp belongs to org
    const followUp = await this.prisma.followUp.findUnique({
      where: { id, organizationId },
    });
    if (!followUp) throw new NotFoundException('Follow-up not found');

    return this.prisma.followUp.update({
      where: { id },
      data: { status },
    });
  }
}
