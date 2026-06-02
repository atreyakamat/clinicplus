import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class InvoicesService {
  constructor(private prisma: PrismaService) {}

  async create(data: any) {
    const { items, ...invoiceData } = data;
    
    return this.prisma.invoice.create({
      data: {
        ...invoiceData,
        items: {
          create: items.map(item => ({
            ...item,
            organizationId: invoiceData.organizationId,
            branchId: invoiceData.branchId,
          })),
        },
      },
      include: { items: true },
    });
  }

  async findAll(organizationId: string, branchId: string) {
    return this.prisma.invoice.findMany({
      where: { organizationId, branchId },
      include: { patient: { select: { firstName: true, lastName: true } }, payments: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id },
      include: { items: true, patient: true, payments: true },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');
    return invoice;
  }

  async addPayment(invoiceId: string, paymentData: any) {
    return this.prisma.payment.create({
      data: {
        ...paymentData,
        invoiceId,
        organizationId: paymentData.organizationId,
        branchId: paymentData.branchId,
      },
    });
  }
}
