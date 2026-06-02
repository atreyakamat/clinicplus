import { Injectable } from '@nestjs/common';
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
      }
    });
  }

  async findAll(organizationId: string, branchId: string) {
    return this.prisma.followUp.findMany({
      where: { organizationId, branchId },
      include: { 
        patient: { select: { firstName: true, lastName: true, phone: true } },
        doctor: { select: { firstName: true, lastName: true } },
        outcomes: true
      },
      orderBy: { scheduledDate: 'asc' }
    });
  }

  async addOutcome(followUpId: string, data: any) {
    return this.prisma.followUpOutcome.create({
      data: {
        ...data,
        followUpId,
        organizationId: data.organizationId,
        branchId: data.branchId,
      }
    });
  }

  async updateStatus(id: string, status: string) {
    return this.prisma.followUp.update({
      where: { id },
      data: { status }
    });
  }
}
