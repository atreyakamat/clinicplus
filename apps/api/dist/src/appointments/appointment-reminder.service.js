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
var AppointmentReminderService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppointmentReminderService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const messages_service_1 = require("../messages/messages.service");
let AppointmentReminderService = AppointmentReminderService_1 = class AppointmentReminderService {
    prisma;
    messagesService;
    logger = new common_1.Logger(AppointmentReminderService_1.name);
    constructor(prisma, messagesService) {
        this.prisma = prisma;
        this.messagesService = messagesService;
    }
    async sendAppointmentReminders(hoursBefore) {
        const now = new Date();
        const targetTime = new Date(now.getTime() + hoursBefore * 60 * 60 * 1000);
        const windowStart = new Date(targetTime.getTime() - 5 * 60 * 1000);
        const windowEnd = new Date(targetTime.getTime() + 5 * 60 * 1000);
        const appointments = await this.prisma.appointment.findMany({
            where: {
                scheduledStart: {
                    gte: windowStart,
                    lte: windowEnd,
                },
                status: 'SCHEDULED',
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
            },
        });
        for (const appointment of appointments) {
            try {
                const patientName = `${appointment.patient.firstName} ${appointment.patient.lastName || ''}`.trim();
                const doctorName = `Dr. ${appointment.doctor.firstName} ${appointment.doctor.lastName || ''}`.trim();
                const appointmentTime = appointment.scheduledStart.toLocaleString();
                const messageContent = `Reminder: You have an appointment with ${doctorName} on ${appointmentTime}. Patient: ${patientName}`;
                try {
                    await this.messagesService.sendWhatsApp(appointment.patient.id, messageContent, appointment.organizationId, appointment.branchId);
                    this.logger.log(`Appointment reminder sent via WhatsApp for appointment ${appointment.id}`);
                }
                catch (whatsappError) {
                    this.logger.warn(`WhatsApp failed for appointment ${appointment.id}, trying SMS: ${whatsappError.message}`);
                    try {
                        await this.messagesService.sendSms(appointment.patient.id, messageContent, appointment.organizationId, appointment.branchId);
                        this.logger.log(`Appointment reminder sent via SMS for appointment ${appointment.id}`);
                    }
                    catch (smsError) {
                        this.logger.error(`Both WhatsApp and SMS failed for appointment ${appointment.id}:`, smsError);
                    }
                }
            }
            catch (error) {
                this.logger.error(`Failed to process appointment reminder for appointment ${appointment.id}:`, error);
            }
        }
    }
    async send24HourReminders() {
        this.logger.log('Sending 24-hour appointment reminders');
        return this.sendAppointmentReminders(24);
    }
    async send2HourReminders() {
        this.logger.log('Sending 2-hour appointment reminders');
        return this.sendAppointmentReminders(2);
    }
};
exports.AppointmentReminderService = AppointmentReminderService;
exports.AppointmentReminderService = AppointmentReminderService = AppointmentReminderService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        messages_service_1.MessagesService])
], AppointmentReminderService);
//# sourceMappingURL=appointment-reminder.service.js.map