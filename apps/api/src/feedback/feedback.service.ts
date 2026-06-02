import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class FeedbackService {
  constructor(private prisma: PrismaService) {}

  async create(data: any) {
    return this.prisma.feedback.create({
      data: {
        ...data,
        organizationId: data.organizationId,
        userId: data.userId,
      }
    });
  }

  async findAll(organizationId: string) {
    return this.prisma.feedback.findMany({
      where: { organizationId },
      include: { user: { select: { firstName: true, lastName: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async updateStatus(id: string, status: string) {
    return this.prisma.feedback.update({
      where: { id },
      data: { status }
    });
  }
}
