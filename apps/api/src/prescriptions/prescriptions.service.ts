import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class PrescriptionsService {
  constructor(private prisma: PrismaService) {}

  async create(data: any) {
    const { items, ...prescriptionData } = data;
    return this.prisma.prescription.create({
      data: {
        ...prescriptionData,
        items: {
          create: items.map(item => ({
            ...item,
            organizationId: prescriptionData.organizationId,
            branchId: prescriptionData.branchId,
          })),
        },
      },
      include: { items: true },
    });
  }

  async findAllByPatient(patientId: string) {
    return this.prisma.prescription.findMany({
      where: { patientId },
      include: { items: true, doctor: { select: { firstName: true, lastName: true } } },
      orderBy: { issuedAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const prescription = await this.prisma.prescription.findUnique({
      where: { id },
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
}
