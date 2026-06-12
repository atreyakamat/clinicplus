"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppointmentReminderModule = void 0;
const common_1 = require("@nestjs/common");
const appointment_reminder_service_1 = require("./appointment-reminder.service");
const messages_module_1 = require("../messages/messages.module");
const prisma_module_1 = require("../prisma/prisma.module");
let AppointmentReminderModule = class AppointmentReminderModule {
};
exports.AppointmentReminderModule = AppointmentReminderModule;
exports.AppointmentReminderModule = AppointmentReminderModule = __decorate([
    (0, common_1.Module)({
        imports: [messages_module_1.MessagesModule, prisma_module_1.PrismaModule],
        providers: [appointment_reminder_service_1.AppointmentReminderService],
        exports: [appointment_reminder_service_1.AppointmentReminderService],
    })
], AppointmentReminderModule);
//# sourceMappingURL=appointment-reminder.module.js.map