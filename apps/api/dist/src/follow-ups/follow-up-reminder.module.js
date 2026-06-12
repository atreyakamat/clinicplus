"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.FollowUpReminderModule = void 0;
const common_1 = require("@nestjs/common");
const follow_up_reminder_service_1 = require("./follow-up-reminder.service");
const messages_module_1 = require("../messages/messages.module");
let FollowUpReminderModule = class FollowUpReminderModule {
};
exports.FollowUpReminderModule = FollowUpReminderModule;
exports.FollowUpReminderModule = FollowUpReminderModule = __decorate([
    (0, common_1.Module)({
        imports: [messages_module_1.MessagesModule],
        providers: [follow_up_reminder_service_1.FollowUpReminderService],
        exports: [follow_up_reminder_service_1.FollowUpReminderService],
    })
], FollowUpReminderModule);
//# sourceMappingURL=follow-up-reminder.module.js.map