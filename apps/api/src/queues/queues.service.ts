import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class QueuesService {
  constructor(private prisma: PrismaService) {}

  async getLiveQueue(organizationId: string, branchId: string) {
    // For now, get the first queue in the branch
    const queue = await this.prisma.queue.findFirst({
      where: { organizationId, branchId },
      include: {
        entries: {
          where: { status: { in: ['WAITING', 'CALLED', 'IN_PROGRESS'] } },
          include: {
            appointment: {
              include: {
                patient: true,
                doctor: { select: { firstName: true, lastName: true } }
              }
            }
          },
          orderBy: { tokenNumber: 'asc' }
        }
      }
    });

    if (!queue) {
      // Create a default queue if none exists
      return this.prisma.queue.create({
        data: {
          name: 'Main Queue',
          organizationId,
          branchId,
        },
        include: { entries: true }
      });
    }

    return queue;
  }

  async checkIn(appointmentId: string, organizationId: string, branchId: string) {
    const queue = await this.getLiveQueue(organizationId, branchId);
    
    // Get last token number
    const lastEntry = await this.prisma.queueEntry.findFirst({
      where: { queueId: queue.id },
      orderBy: { tokenNumber: 'desc' }
    });

    const tokenNumber = (lastEntry?.tokenNumber || 0) + 1;

    return this.prisma.queueEntry.create({
      data: {
        queueId: queue.id,
        appointmentId,
        organizationId,
        branchId,
        tokenNumber,
        checkInTime: new Date(),
        status: 'WAITING'
      }
    });
  }

  async updateEntryStatus(entryId: string, status: 'WAITING' | 'CALLED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED') {
    const data: any = { status };
    if (status === 'CALLED') data.calledTime = new Date();
    if (status === 'COMPLETED') data.completedTime = new Date();

    return this.prisma.queueEntry.update({
      where: { id: entryId },
      data
    });
  }
}
