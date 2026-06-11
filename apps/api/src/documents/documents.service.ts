import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class DocumentsService {
  constructor(private prisma: PrismaService) {}

  async create(
    data: Prisma.MedicalDocumentUncheckedCreateInput,
    organizationId: string,
    branchId: string,
    uploadedBy: string,
  ) {
    return this.prisma.medicalDocument.create({
      data: {
        ...data,
        organizationId,
        branchId,
        uploadedBy,
      },
    });
  }

  async findAll(organizationId: string, branchId: string) {
    return this.prisma.medicalDocument.findMany({
      where: {
        organizationId,
        branchId,
      },
      include: {
        patient: {
          select: { id: true, firstName: true, lastName: true },
        },
        uploader: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async findOne(id: string, organizationId: string, branchId: string) {
    const document = await this.prisma.medicalDocument.findFirst({ where: { id, organizationId, branchId },
      include: {
        patient: {
          select: { id: true, firstName: true, lastName: true },
        },
        uploader: {
          select: { id: true, firstName: true, lastName: true },
        },
        labReports: true,
        imagingReports: true,
      },
    });
    if (!document) {
      throw new NotFoundException(`Document with ID ${id} not found`);
    }
    return document;
  }

  async update(
    id: string,
    data: Prisma.MedicalDocumentUpdateInput,
    organizationId: string,
    branchId: string,
  ) {
    // Verify document belongs to org/branch first
    await this.findOne(id, organizationId, branchId);

    return this.prisma.medicalDocument.update({
      where: { id },
      data: {
        ...data,
        updatedAt: new Date(),
      },
    });
  }

  async remove(id: string, organizationId: string, branchId: string) {
    // Verify document belongs to org/branch first
    await this.findOne(id, organizationId, branchId);

    // Soft delete - assuming we have a status field or deletedAt
    // Since MedicalDocument doesn't have explicit soft delete fields in schema,
    // we'll do a hard delete for now but in production should implement soft delete
    return this.prisma.medicalDocument.delete({
      where: { id },
    });
  }
}
