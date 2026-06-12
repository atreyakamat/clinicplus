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
var FollowUpReminderService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.FollowUpReminderService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const messages_service_1 = require("../messages/messages.service");
let FollowUpReminderService = FollowUpReminderService_1 = class FollowUpReminderService {
    prisma;
    messagesService;
    logger = new common_1.Logger(FollowUpReminderService_1.name);
    constructor(prisma, messagesService) {
        this.prisma = prisma;
        this.messagesService = messagesService;
    }
    async sendFollowUpReminders(daysBefore) {
        const now = new Date();
        const targetDate = new Date(now.getTime() + daysBefore * 24 * 60 * 60 * 1000);
        targetDate.setHours(0, 0, 0, 0);
        const startOfDay = targetDate;
        const endOfDay = new Date(targetDate.getTime() + 24 * 60 * 60 * 1000 - 1);
        const followUps = await this.prisma.followUp.findMany({
            where: {
                scheduledDate: {
                    gte: startOfDay,
                    lte: endOfDay,
                },
            },
            include: {
                patient: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                        phone: true,
                    },
                },
                doctor: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                    },
                },
                consultation: {
                    select: {
                        id: true,
                    },
                },
            },
        });
        for (const followUp of followUps) {
            try {
                const patientName = `${followUp.patient.firstName} ${followUp.patient.lastName || ''}`.trim();
                const doctorName = `Dr. ${followUp.doctor.firstName} ${followUp.doctor.lastName || ''}`.trim();
                const followUpDate = followUp.scheduledDate.toLocaleDateString();
                const messageContent = `Reminder: You have a follow-up appointment with ${doctorName} on ${followUpDate}. Patient: ${patientName}`;
                try {
                    await this.messagesService.sendWhatsApp(followUp.patient.id, messageContent, followUp.organizationId, followUp.branchId);
                    this.logger.log(`Follow-up reminder sent via WhatsApp for follow-up ${followUp.id}`);
                }
                catch (whatsappError) {
                    this.logger.warn(`WhatsApp failed for follow-up ${followUp.id}, trying SMS: ${whatsappError.message}`);
                    try {
                        await this.messagesService.sendSms(followUp.patient.id, messageContent, followUp.organizationId, followUp.branchId);
                        this.logger.log(`Follow-up reminder sent via SMS for follow-up ${followUp.id}`);
                    }
                    catch (smsError) {
                        this.logger.error(`Both WhatsApp and SMS failed for follow-up ${followUp.id}:`, smsError);
                    }
                }
            }
            catch (error) {
                this.logger.error(`Failed to process follow-up reminder for follow-up ${followUp.id}:`, error);
            }
        }
    }
    async sendTomorrowFollowUpReminders() {
        this.logger.log('Sending tomorrow follow-up reminders');
        return this.sendFollowUpReminders(1);
    }
    async sendTodayFollowUpReminders() {
        this.logger.log('Sending today follow-up reminders');
        return this.sendFollowUpReminders(0);
    }
};
exports.FollowUpReminderService = FollowUpReminderService;
exports.FollowUpReminderService = FollowUpReminderService = FollowUpReminderService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        messages_service_1.MessagesService])
], FollowUpReminderService);
//# sourceMappingURL=follow-up-reminder.service.js.map