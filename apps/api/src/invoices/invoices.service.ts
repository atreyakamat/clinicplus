import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class InvoicesService {
  constructor(private prisma: PrismaService) {}
async create(
  data: any,
  organizationId: string,
  branchId: string,
  createdBy: string,
) {
  const { items = [], ...invoiceData } = data;

  return this.prisma.invoice.create({
    data: {
      ...invoiceData,
      organizationId,
      branchId,
      createdBy,
      items: {
        create: items.map((item) => ({
          ...item,
          organizationId,
          branchId,
        })),
      },
    },
    include: {
      items: true,
    },
  });
}
  async findAll(organizationId: string, branchId: string) {
    return this.prisma.invoice.findMany({
      where: { organizationId, branchId },
      include: {
        patient: { select: { firstName: true, lastName: true } },
        payments: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string, organizationId: string, branchId: string) {
    const invoice = await this.prisma.invoice.findFirst({ where: { id, organizationId, branchId },
      include: { items: true, patient: true, payments: true },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');
    return invoice;
  }

  async addPayment(
    invoiceId: string,
    paymentData: any,
    organizationId: string,
    branchId: string,
  ) {
    // Verify invoice exists and belongs to org
    const invoice = await this.findOne(invoiceId, organizationId, branchId);

    return this.prisma.payment.create({
      data: {
        ...paymentData,
        invoiceId: invoice.id,
        organizationId,
        branchId,
      },
    });
  }
}
