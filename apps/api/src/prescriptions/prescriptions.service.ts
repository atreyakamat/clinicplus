import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class PrescriptionsService {
  constructor(private prisma: PrismaService) {}

  async create(data: any) {
    const { items = [], ...prescriptionData } = data;
    return this.prisma.prescription.create({
      data: {
        ...prescriptionData,
        items: {
          create: items.map((item) => ({
            ...item,
            organizationId: prescriptionData.organizationId,
            branchId: prescriptionData.branchId,
          })),
        },
      },
      include: { items: true },
    });
  }

  async findAll(organizationId: string, branchId: string, patientId?: string) {
    return this.prisma.prescription.findMany({
      where: {
        organizationId,
        branchId,
        ...(patientId ? { patientId } : {}),
      },
      include: {
        items: true,
        patient: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
        doctor: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
      },
      orderBy: { issuedAt: 'desc' },
    });
  }

  async findOne(id: string, organizationId: string, branchId: string) {
    const prescription = await this.prisma.prescription.findFirst({ where: { id, organizationId, branchId },
      include: {
        items: true,
        patient: true,
        doctor: { select: { firstName: true, lastName: true } },
        consultation: true,
      },
    });
    if (!prescription) throw new NotFoundException('Prescription not found');
    return prescription;
  }

  async update(id: string, data: any, organizationId: string, branchId: string) {
    // Verify prescription belongs to org/branch
    await this.findOne(id, organizationId, branchId);

    return this.prisma.prescription.update({
      where: { id },
      data,
    });
  }
}
