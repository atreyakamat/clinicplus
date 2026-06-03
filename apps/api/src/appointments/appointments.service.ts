import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { AuditService } from '../common/services/audit.service';

@Injectable()
export class AppointmentsService {
  constructor(
    private prisma: PrismaService,
    private auditService: AuditService,
  ) {}

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

    const appointment = await this.prisma.appointment.create({
      data: {
        ...data,
        organizationId,
        branchId,
        createdBy,
      },
    });

    // Audit logging
    await this.auditService.log({
      organizationId: appointment.organizationId,
      userId: createdBy,
      action: 'CREATE',
      resource: 'appointment',
      resourceId: appointment.id,
      afterData: {
        id: appointment.id,
        patientId: appointment.patientId,
        doctorId: appointment.doctorId,
        scheduledStart: appointment.scheduledStart,
        scheduledEnd: appointment.scheduledEnd,
        status: appointment.status,
        organizationId: appointment.organizationId,
        branchId: appointment.branchId
      },
    });

    return appointment;
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

  async update(id: string, data: Prisma.AppointmentUpdateInput, organizationId: string, branchId: string, updatedBy: string) {
    // First get the old data for audit
    const oldAppointment = await this.prisma.appointment.findUnique({
      where: { id, organizationId, branchId },
      include: {
        patient: {
          select: { id: true, firstName: true, lastName: true }
        },
        doctor: {
          select: { id: true, firstName: true, lastName: true }
        }
      }
    });

    if (!oldAppointment) {
      throw new NotFoundException('Appointment not found');
    }

    const appointment = await this.prisma.appointment.update({
      where: { id },
      data,
    });

    // Audit logging
    await this.auditService.log({
      organizationId: appointment.organizationId,
      userId: updatedBy,
      action: 'UPDATE',
      resource: 'appointment',
      resourceId: appointment.id,
      beforeData: oldAppointment,
      afterData: appointment,
    });

    return appointment;
  }

  async remove(id: string, organizationId: string, branchId: string, removedBy: string) {
    // First get the old data for audit
    const oldAppointment = await this.prisma.appointment.findUnique({
      where: { id, organizationId, branchId },
      include: {
        patient: {
          select: { id: true, firstName: true, lastName: true }
        },
        doctor: {
          select: { id: true, firstName: true, lastName: true }
        }
      }
    });

    if (!oldAppointment) {
      throw new NotFoundException('Appointment not found');
    }

    const appointment = await this.prisma.appointment.update({
      where: { id },
      data: { status: 'CANCELLED' },
    });

    // Audit logging
    await this.auditService.log({
      organizationId: appointment.organizationId,
      userId: removedBy,
      action: 'DELETE',
      resource: 'appointment',
      resourceId: appointment.id,
      beforeData: oldAppointment,
      afterData: {
        id: appointment.id,
        status: appointment.status,
        // Note: We're not including all fields for brevity, but in production you'd want to include relevant fields
      },
    });

    return appointment;
  }
}
