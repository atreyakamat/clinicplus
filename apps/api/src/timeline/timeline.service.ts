import { Injectable, Global } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class TimelineService {
  constructor(private prisma: PrismaService) {}

  async record(data: {
    organizationId: string;
    patientId: string;
    eventType: string;
    eventCategory: string;
    title: string;
    description?: string;
    metadata?: any;
    createdBy?: string;
  }, tx?: any) {
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

  async findAllByPatient(patientId: string, organizationId: string) {
    return this.prisma.timelineEvent.findMany({
      where: {
        patientId,
        organizationId,
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}
