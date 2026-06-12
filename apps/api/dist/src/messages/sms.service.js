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
exports.SmsService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
let SmsService = class SmsService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async sendSms(to, content, organizationId, branchId) {
        if (!to || !content) {
            throw new common_1.BadRequestException('Phone number and content are required');
        }
        return true;
    }
    async sendAndRecord(patientId, content, organizationId, branchId) {
        const success = await this.sendSms('', content, organizationId, branchId);
        return this.prisma.message.create({
            data: {
                patientId,
                messageBody: content,
                channel: 'SMS',
                direction: 'OUTBOUND',
                deliveryStatus: success ? 'SENT' : 'FAILED',
                organizationId,
                branchId,
            },
        });
    }
};
exports.SmsService = SmsService;
exports.SmsService = SmsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], SmsService);
//# sourceMappingURL=sms.service.js.map