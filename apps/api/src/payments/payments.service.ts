import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { RefundPaymentDto } from './dto/refund-payment.dto';
import { PaymentStatus, InvoiceStatus } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

@Injectable()
export class PaymentsService {
  constructor(private prisma: PrismaService) {}

  async createPayment(
    createPaymentDto: CreatePaymentDto,
    organizationId: string,
    branchId: string,
    userId: string,
  ) {
    // Verify invoice exists and belongs to organization/branch
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: createPaymentDto.invoiceId },
      include: { patient: true },
    });

    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }

    if (invoice.organizationId !== organizationId || invoice.branchId !== branchId) {
      throw new BadRequestException('Invoice does not belong to this organization/branch');
    }

    // Calculate total paid amount for this invoice
    const totalPaid = await this.prisma.payment.aggregate({
      _sum: { amount: true },
      where: {
        invoiceId: createPaymentDto.invoiceId,
        paymentStatus: 'PAID',
        organizationId,
        branchId,
      },
    });

    const totalAmount = invoice.total;
    const alreadyPaid = totalPaid._sum.amount || new Decimal(0);
    const remainingAmount = totalAmount.minus(alreadyPaid);

    if (new Decimal(createPaymentDto.amount).gt(remainingAmount)) {
      throw new BadRequestException(
        `Payment amount exceeds remaining balance. Remaining: ${remainingAmount.toString()}`,
      );
    }

    // Create payment record
    const payment = await this.prisma.payment.create({
      data: {
        amount: createPaymentDto.amount,
        paymentMethod: createPaymentDto.paymentMethod,
        transactionReference: createPaymentDto.transactionReference,
        invoiceId: createPaymentDto.invoiceId,
        organizationId,
        branchId,
        createdById: userId,
        paymentStatus: (createPaymentDto.paymentStatus as PaymentStatus) || 'PENDING',
      },
    });

    // If payment is paid, update invoice status
    if (payment.paymentStatus === 'PAID') {
      await this.prisma.invoice.update({
        where: { id: createPaymentDto.invoiceId },
        data: {
          status: (await this.calculateInvoiceStatus(createPaymentDto.invoiceId, organizationId, branchId)) as InvoiceStatus,
        },
      });
    }

    return payment;
  }

  async findPaymentById(
    id: string,
    organizationId: string,
    branchId: string,
  ) {
    const payment = await this.prisma.payment.findUnique({
      where: { id },
      include: {
        invoice: {
          include: { patient: true },
        },
      },
    });

    if (!payment) {
      throw new NotFoundException('Payment not found');
    }

    if (payment.organizationId !== organizationId || payment.branchId !== branchId) {
      throw new NotFoundException('Payment not found');
    }

    return payment;
  }

  async refundPayment(
    paymentId: string,
    refundPaymentDto: RefundPaymentDto,
    organizationId: string,
    branchId: string,
    userId: string,
  ) {
    // Verify payment exists and belongs to organization/branch
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: { invoice: true },
    });

    if (!payment) {
      throw new NotFoundException('Payment not found');
    }

    if (payment.organizationId !== organizationId || payment.branchId !== branchId) {
      throw new BadRequestException('Payment does not belong to this organization/branch');
    }

    if (payment.paymentStatus !== 'PAID') {
      throw new BadRequestException('Only paid payments can be refunded');
    }

    if (new Decimal(refundPaymentDto.amount).gt(payment.amount)) {
      throw new BadRequestException('Refund amount cannot exceed original payment amount');
    }

    // Calculate total refunded amount for this payment
    const totalRefunded = await this.prisma.payment.aggregate({
      _sum: { amount: true },
      where: {
        invoiceId: payment.invoiceId,
        paymentStatus: 'REFUNDED',
        organizationId,
        branchId,
      },
    });

    const alreadyRefunded = totalRefunded._sum.amount || new Decimal(0);
    if (alreadyRefunded.plus(refundPaymentDto.amount).gt(payment.amount)) {
      throw new BadRequestException('Total refund amount cannot exceed original payment amount');
    }

    // Create refund payment record
    const refundPayment = await this.prisma.payment.create({
      data: {
        amount: refundPaymentDto.amount,
        paymentMethod: payment.paymentMethod,
        paymentStatus: 'REFUNDED',
        transactionReference: refundPaymentDto.reason,
        invoiceId: payment.invoiceId,
        organizationId,
        branchId,
        createdById: userId,
        isRefund: true,
        originalPaymentId: payment.id,
      },
    });

    // Update original payment status if fully refunded
    const totalPaidAfterRefund = await this.prisma.payment.aggregate({
      _sum: { amount: true },
      where: {
        invoiceId: payment.invoiceId,
        paymentStatus: 'PAID',
        organizationId,
        branchId,
      },
    });

    const totalRefundedAfterRefund = await this.prisma.payment.aggregate({
      _sum: { amount: true },
      where: {
        invoiceId: payment.invoiceId,
        paymentStatus: 'REFUNDED',
        organizationId,
        branchId,
      },
    });

    const paidSum = totalPaidAfterRefund._sum.amount || new Decimal(0);
    const refundedSum = totalRefundedAfterRefund._sum.amount || new Decimal(0);
    const netPaid = paidSum.minus(refundedSum);

    const invoice = await this.prisma.invoice.findUnique({
      where: { id: payment.invoiceId },
    });

    if (!invoice) throw new NotFoundException('Invoice not found');

    let newPaymentStatus: PaymentStatus = 'PAID';
    if (netPaid.lte(0)) {
      newPaymentStatus = 'REFUNDED';
    } else if (netPaid.lt(invoice.total)) {
      newPaymentStatus = 'PARTIALLY_REFUNDED';
    }

    // Update original payment status
    await this.prisma.payment.update({
      where: { id: paymentId },
      data: { paymentStatus: newPaymentStatus },
    });

    // Update invoice status
    await this.prisma.invoice.update({
      where: { id: payment.invoiceId },
      data: {
        status: (await this.calculateInvoiceStatus(payment.invoiceId, organizationId, branchId)) as InvoiceStatus,
      },
    });

    return refundPayment;
  }

  async getPaymentsByInvoice(
    invoiceId: string,
    organizationId: string,
    branchId: string,
  ) {
    // Verify invoice exists and belongs to organization/branch
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
    });

    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }

    if (invoice.organizationId !== organizationId || invoice.branchId !== branchId) {
      throw new BadRequestException('Invoice does not belong to this organization/branch');
    }

    return this.prisma.payment.findMany({
      where: {
        invoiceId,
        organizationId,
        branchId,
      },
      include: {
        createdBy: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getPayments(
    organizationId: string,
    branchId: string,
    skip: number = 0,
    take: number = 10,
  ) {
    return this.prisma.payment.findMany({
      where: {
        organizationId,
        branchId,
        isRefund: false, // Exclude refund payments from main list
      },
      include: {
        invoice: {
          include: { patient: true },
        },
        createdBy: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
      skip,
      take,
      orderBy: { createdAt: 'desc' },
    });
  }

  async countPayments(
    organizationId: string,
    branchId: string,
  ) {
    return this.prisma.payment.count({
      where: {
        organizationId,
        branchId,
        isRefund: false, // Exclude refund payments from count
      },
    });
  }

  private async calculateInvoiceStatus(
    invoiceId: string,
    organizationId: string,
    branchId: string,
  ): Promise<string> {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
    });

    if (!invoice) {
      return 'DRAFT';
    }

    const totalPaid = await this.prisma.payment.aggregate({
      _sum: { amount: true },
      where: {
        invoiceId,
        paymentStatus: 'PAID',
        organizationId,
        branchId,
      },
    });

    const totalRefunded = await this.prisma.payment.aggregate({
      _sum: { amount: true },
      where: {
        invoiceId,
        paymentStatus: 'REFUNDED',
        organizationId,
        branchId,
      },
    });

    const paidAmount = totalPaid._sum.amount || new Decimal(0);
    const refundedAmount = totalRefunded._sum.amount || new Decimal(0);
    const netPaid = paidAmount.minus(refundedAmount);

    if (netPaid.lte(0)) {
      return 'VOID'; // or 'REFUNDED' if added to InvoiceStatus enum, but VOID is in enum
    } else if (netPaid.gte(invoice.total)) {
      return 'PAID';
    } else {
      return 'PARTIALLY_PAID';
    }
  }
}