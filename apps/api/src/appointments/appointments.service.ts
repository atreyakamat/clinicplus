import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class AppointmentsService {
  constructor(private prisma: PrismaService) {}

  async create(data: Prisma.AppointmentUncheckedCreateInput, organizationId: string, branchId: string, createdBy: string) {
    // Check if slot is available
    const overlapping = await this.prisma.appointment.findFirst({
      where: {
        doctorId: data.doctorId,
        organizationId,
        branchId,
        status: { notIn: ['CANCELLED', 'NO_SHOW'] },
        OR: [
          {
            scheduledStart: { lte: data.scheduledStart },
            scheduledEnd: { gt: data.scheduledStart },
          },
          {
            scheduledStart: { lt: data.scheduledEnd },
            scheduledEnd: { gte: data.scheduledEnd },
          },
        ]
      },
    });

    if (overlapping) {
      throw new BadRequestException('Doctor is already booked for this time slot');
    }

    return this.prisma.appointment.create({
      data: {
        ...data,
        organizationId,
        branchId,
        createdBy,
      },
    });
  }

  async findAll(organizationId: string, branchId: string, date?: string) {
    const where: Prisma.AppointmentWhereInput = {
      organizationId,
      branchId,
      status: { not: 'CANCELLED' },
    };

    if (date) {
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);
      
      where.scheduledStart = {
        gte: startOfDay,
        lte: endOfDay,
      };
    }

    return this.prisma.appointment.findMany({
      where,
      include: {
        patient: {
          select: { id: true, firstName: true, lastName: true, phone: true }
        },
        doctor: {
          select: { id: true, firstName: true, lastName: true }
        }
      },
      orderBy: {
        scheduledStart: 'asc',
      },
    });
  }

  async findOne(id: string, organizationId: string, branchId: string) {
    const appointment = await this.prisma.appointment.findUnique({
      where: { id, organizationId, branchId },
      include: {
        patient: true,
        doctor: {
          select: { id: true, firstName: true, lastName: true }
        }
      },
    });
    if (!appointment) throw new NotFoundException('Appointment not found');
    return appointment;
  }

  async update(id: string, data: Prisma.AppointmentUpdateInput) {
    return this.prisma.appointment.update({
      where: { id },
      data,
    });
  }

  async remove(id: string) {
    return this.prisma.appointment.update({
      where: { id },
      data: { status: 'CANCELLED' },
    });
  }
}
