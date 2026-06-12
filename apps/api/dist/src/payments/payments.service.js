"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PaymentsService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const library_1 = require("@prisma/client/runtime/library");
let PaymentsService = class PaymentsService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async createPayment(createPaymentDto, organizationId, branchId, userId) {
        const invoice = await this.prisma.invoice.findUnique({
            where: { id: createPaymentDto.invoiceId },
            include: { patient: true },
        });
        if (!invoice) {
            throw new common_1.NotFoundException('Invoice not found');
        }
        if (invoice.organizationId !== organizationId ||
            invoice.branchId !== branchId) {
            throw new common_1.BadRequestException('Invoice does not belong to this organization/branch');
        }
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
        const alreadyPaid = totalPaid._sum.amount || new library_1.Decimal(0);
        const remainingAmount = totalAmount.minus(alreadyPaid);
        if (new library_1.Decimal(createPaymentDto.amount).gt(remainingAmount)) {
            throw new common_1.BadRequestException(`Payment amount exceeds remaining balance. Remaining: ${remainingAmount.toString()}`);
        }
        const payment = await this.prisma.payment.create({
            data: {
                amount: createPaymentDto.amount,
                paymentMethod: createPaymentDto.paymentMethod,
                transactionReference: createPaymentDto.transactionReference,
                invoiceId: createPaymentDto.invoiceId,
                organizationId,
                branchId,
                createdById: userId,
                paymentStatus: createPaymentDto.paymentStatus || 'PENDING',
            },
        });
        if (payment.paymentStatus === 'PAID') {
            await this.prisma.invoice.update({
                where: { id: createPaymentDto.invoiceId },
                data: {
                    status: (await this.calculateInvoiceStatus(createPaymentDto.invoiceId, organizationId, branchId)),
                },
            });
        }
        return payment;
    }
    async findPaymentById(id, organizationId, branchId) {
        const payment = await this.prisma.payment.findUnique({
            where: { id },
            include: {
                invoice: {
                    include: { patient: true },
                },
            },
        });
        if (!payment) {
            throw new common_1.NotFoundException('Payment not found');
        }
        if (payment.organizationId !== organizationId ||
            payment.branchId !== branchId) {
            throw new common_1.NotFoundException('Payment not found');
        }
        return payment;
    }
    async refundPayment(paymentId, refundPaymentDto, organizationId, branchId, userId) {
        const payment = await this.prisma.payment.findUnique({
            where: { id: paymentId },
            include: { invoice: true },
        });
        if (!payment) {
            throw new common_1.NotFoundException('Payment not found');
        }
        if (payment.organizationId !== organizationId ||
            payment.branchId !== branchId) {
            throw new common_1.BadRequestException('Payment does not belong to this organization/branch');
        }
        if (payment.paymentStatus !== 'PAID') {
            throw new common_1.BadRequestException('Only paid payments can be refunded');
        }
        if (new library_1.Decimal(refundPaymentDto.amount).gt(payment.amount)) {
            throw new common_1.BadRequestException('Refund amount cannot exceed original payment amount');
        }
        const totalRefunded = await this.prisma.payment.aggregate({
            _sum: { amount: true },
            where: {
                invoiceId: payment.invoiceId,
                paymentStatus: 'REFUNDED',
                organizationId,
                branchId,
            },
        });
        const alreadyRefunded = totalRefunded._sum.amount || new library_1.Decimal(0);
        if (alreadyRefunded.plus(refundPaymentDto.amount).gt(payment.amount)) {
            throw new common_1.BadRequestException('Total refund amount cannot exceed original payment amount');
        }
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
        const paidSum = totalPaidAfterRefund._sum.amount || new library_1.Decimal(0);
        const refundedSum = totalRefundedAfterRefund._sum.amount || new library_1.Decimal(0);
        const netPaid = paidSum.minus(refundedSum);
        const invoice = await this.prisma.invoice.findUnique({
            where: { id: payment.invoiceId },
        });
        if (!invoice)
            throw new common_1.NotFoundException('Invoice not found');
        let newPaymentStatus = 'PAID';
        if (netPaid.lte(0)) {
            newPaymentStatus = 'REFUNDED';
        }
        else if (netPaid.lt(invoice.total)) {
            newPaymentStatus = 'PARTIALLY_REFUNDED';
        }
        await this.prisma.payment.update({
            where: { id: paymentId },
            data: { paymentStatus: newPaymentStatus },
        });
        await this.prisma.invoice.update({
            where: { id: payment.invoiceId },
            data: {
                status: (await this.calculateInvoiceStatus(payment.invoiceId, organizationId, branchId)),
            },
        });
        return refundPayment;
    }
    async getPaymentsByInvoice(invoiceId, organizationId, branchId) {
        const invoice = await this.prisma.invoice.findUnique({
            where: { id: invoiceId },
        });
        if (!invoice) {
            throw new common_1.NotFoundException('Invoice not found');
        }
        if (invoice.organizationId !== organizationId ||
            invoice.branchId !== branchId) {
            throw new common_1.BadRequestException('Invoice does not belong to this organization/branch');
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
    async getPayments(organizationId, branchId, skip = 0, take = 10) {
        return this.prisma.payment.findMany({
            where: {
                organizationId,
                branchId,
                isRefund: false,
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
    async countPayments(organizationId, branchId) {
        return this.prisma.payment.count({
            where: {
                organizationId,
                branchId,
                isRefund: false,
            },
        });
    }
    async calculateInvoiceStatus(invoiceId, organizationId, branchId) {
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
        const paidAmount = totalPaid._sum.amount || new library_1.Decimal(0);
        const refundedAmount = totalRefunded._sum.amount || new library_1.Decimal(0);
        const netPaid = paidAmount.minus(refundedAmount);
        if (netPaid.lte(0)) {
            return 'VOID';
        }
        else if (netPaid.gte(invoice.total)) {
            return 'PAID';
        }
        else {
            return 'PARTIALLY_PAID';
        }
    }
};
exports.PaymentsService = PaymentsService;
exports.PaymentsService = PaymentsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], PaymentsService);
//# sourceMappingURL=payments.service.js.map