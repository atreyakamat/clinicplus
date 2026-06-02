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
exports.InvoicesService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
let InvoicesService = class InvoicesService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async create(data) {
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
    async findAll(organizationId, branchId) {
        return this.prisma.invoice.findMany({
            where: { organizationId, branchId },
            include: { patient: { select: { firstName: true, lastName: true } }, payments: true },
            orderBy: { createdAt: 'desc' },
        });
    }
    async findOne(id) {
        const invoice = await this.prisma.invoice.findUnique({
            where: { id },
            include: { items: true, patient: true, payments: true },
        });
        if (!invoice)
            throw new common_1.NotFoundException('Invoice not found');
        return invoice;
    }
    async addPayment(invoiceId, paymentData) {
        return this.prisma.payment.create({
            data: {
                ...paymentData,
                invoiceId,
                organizationId: paymentData.organizationId,
                branchId: paymentData.branchId,
            },
        });
    }
};
exports.InvoicesService = InvoicesService;
exports.InvoicesService = InvoicesService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], InvoicesService);
//# sourceMappingURL=invoices.service.js.map