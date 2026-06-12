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
exports.MessagesService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const sms_service_1 = require("./sms.service");
let MessagesService = class MessagesService {
    prisma;
    smsService;
    constructor(prisma, smsService) {
        this.prisma = prisma;
        this.smsService = smsService;
    }
    async findAll(organizationId, branchId) {
        return this.prisma.message.findMany({
            where: { organizationId, branchId },
            include: {
                patient: { select: { firstName: true, lastName: true, phone: true } },
            },
            orderBy: { createdAt: 'desc' },
        });
    }
    async sendWhatsApp(patientId, content, organizationId, branchId) {
        let attempts = 0;
        const maxAttempts = 3;
        let success = false;
        while (attempts < maxAttempts && !success) {
            try {
                success = true;
            }
            catch (error) {
                attempts++;
                if (attempts >= maxAttempts)
                    throw error;
            }
        }
        return this.prisma.message.create({
            data: {
                patientId,
                messageBody: content,
                channel: 'WHATSAPP',
                direction: 'OUTBOUND',
                deliveryStatus: success ? 'SENT' : 'FAILED',
                organizationId,
                branchId,
            },
        });
    }
    async sendSms(patientId, content, organizationId, branchId) {
        const patient = await this.prisma.patient.findUnique({
            where: { id: patientId },
            select: { phone: true },
        });
        if (!patient?.phone) {
            throw new common_1.BadRequestException('Patient phone number not found');
        }
        const smsResult = await this.smsService.sendSms(patient.phone, content, organizationId, branchId);
        const message = await this.prisma.message.create({
            data: {
                patientId,
                messageBody: content,
                channel: 'SMS',
                direction: 'OUTBOUND',
                deliveryStatus: smsResult.success ? 'SENT' : 'FAILED',
                organizationId,
                branchId,
            },
        });
        return {
            ...message,
            gatewayMessageId: smsResult.messageId,
            gatewayError: smsResult.error,
        };
    }
    async getTemplates(organizationId) {
        return this.prisma.template.findMany({
            where: {
                organizationId,
                channel: {
                    in: ['WHATSAPP', 'SMS'],
                },
            },
        });
    }
};
exports.MessagesService = MessagesService;
exports.MessagesService = MessagesService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        sms_service_1.SmsService])
], MessagesService);
//# sourceMappingURL=messages.service.js.map