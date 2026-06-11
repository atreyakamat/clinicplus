import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class ConsultationsService {
  constructor(private prisma: PrismaService) {}

  async create(data: Prisma.ConsultationUncheckedCreateInput) {
    return this.prisma.consultation.create({
      data,
    });
  }

  async findAll(organizationId: string, branchId: string, patientId?: string) {
    return this.prisma.consultation.findMany({
      where: {
        organizationId,
        branchId,
        ...(patientId ? { patientId } : {}),
      },
      include: {
        diagnoses: true,
        vitals: true,
        patient: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
        doctor: { select: { firstName: true, lastName: true } },
      },
      orderBy: { consultationDate: 'desc' },
    });
  }

  async findOne(id: string, organizationId: string, branchId: string) {
    const consultation = await this.prisma.consultation.findFirst({ where: { id, organizationId, branchId },
      include: {
        patient: true,
        diagnoses: true,
        vitals: true,
        prescriptions: { include: { items: true } },
        followUps: true,
        doctor: { select: { firstName: true, lastName: true } },
      },
    });
    if (!consultation) throw new NotFoundException('Consultation not found');
    return consultation;
  }

  async update(
    id: string,
    data: any,
    organizationId: string,
    branchId: string,
  ) {
    const { diagnoses, vitals, ...consultationData } = data;

    // Use transaction to update consultation and its nested records
    return this.prisma.$transaction(async (tx) => {
      // Verify consultation belongs to org/branch
      await this.findOne(id, organizationId, branchId);

      const updated = await tx.consultation.update({
        where: { id },
        data: consultationData,
      });

      if (vitals) {
        // Assume one vital record per consultation for simplicity
        await tx.vital.upsert({
          where: { id: vitals.id || 'none' }, // Simple upsert logic
          update: vitals,
          create: {
            ...vitals,
            consultationId: id,
            organizationId: updated.organizationId,
            branchId: updated.branchId,
          },
        });
      }

      if (diagnoses && Array.isArray(diagnoses)) {
        // Delete old diagnoses and insert new ones or handle syncing
        await tx.diagnosis.deleteMany({ where: { consultationId: id } });
        await tx.diagnosis.createMany({
          data: diagnoses.map((d) => ({
            ...d,
            consultationId: id,
            organizationId: updated.organizationId,
            branchId: updated.branchId,
          })),
        });
      }

      return updated;
    });
  }

  async complete(id: string, organizationId: string, branchId: string) {
    // Verify consultation belongs to org/branch
    await this.findOne(id, organizationId, branchId);

    return this.prisma.consultation.update({
      where: { id },
      data: { status: 'COMPLETED' },
    });
  }
}
