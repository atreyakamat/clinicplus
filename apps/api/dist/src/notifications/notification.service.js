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
var NotificationService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.NotificationService = void 0;
const common_1 = require("@nestjs/common");
const appointment_reminder_service_1 = require("../appointments/appointment-reminder.service");
const follow_up_reminder_service_1 = require("../follow-ups/follow-up-reminder.service");
let NotificationService = NotificationService_1 = class NotificationService {
    appointmentReminderService;
    followUpReminderService;
    logger = new common_1.Logger(NotificationService_1.name);
    constructor(appointmentReminderService, followUpReminderService) {
        this.appointmentReminderService = appointmentReminderService;
        this.followUpReminderService = followUpReminderService;
    }
    async sendScheduledNotifications() {
        this.logger.log('Running scheduled notifications');
        try {
            await this.appointmentReminderService.send24HourReminders();
            this.logger.log('Completed 24-hour appointment reminders');
        }
        catch (error) {
            this.logger.error('Failed to send 24-hour appointment reminders:', error);
        }
        try {
            await this.appointmentReminderService.send2HourReminders();
            this.logger.log('Completed 2-hour appointment reminders');
        }
        catch (error) {
            this.logger.error('Failed to send 2-hour appointment reminders:', error);
        }
        try {
            await this.followUpReminderService.sendTomorrowFollowUpReminders();
            this.logger.log('Completed tomorrow follow-up reminders');
        }
        catch (error) {
            this.logger.error('Failed to send tomorrow follow-up reminders:', error);
        }
        try {
            await this.followUpReminderService.sendTodayFollowUpReminders();
            this.logger.log('Completed today follow-up reminders');
        }
        catch (error) {
            this.logger.error('Failed to send today follow-up reminders:', error);
        }
    }
    async sendAppointmentRemindersForHours(hoursBefore) {
        return this.appointmentReminderService.sendAppointmentReminders(hoursBefore);
    }
    async sendFollowUpRemindersForDays(daysBefore) {
        return this.followUpReminderService.sendFollowUpReminders(daysBefore);
    }
};
exports.NotificationService = NotificationService;
exports.NotificationService = NotificationService = NotificationService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [appointment_reminder_service_1.AppointmentReminderService,
        follow_up_reminder_service_1.FollowUpReminderService])
], NotificationService);
//# sourceMappingURL=notification.service.js.map