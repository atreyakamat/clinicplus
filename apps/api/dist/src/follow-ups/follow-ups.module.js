"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.FollowUpsModule = void 0;
const common_1 = require("@nestjs/common");
const follow_ups_controller_1 = require("./follow-ups.controller");
const follow_ups_service_1 = require("./follow-ups.service");
const follow_up_reminder_module_1 = require("./follow-up-reminder.module");
let FollowUpsModule = class FollowUpsModule {
};
exports.FollowUpsModule = FollowUpsModule;
exports.FollowUpsModule = FollowUpsModule = __decorate([
    (0, common_1.Module)({
        controllers: [follow_ups_controller_1.FollowUpsController],
        providers: [follow_ups_service_1.FollowUpsService],
        imports: [follow_up_reminder_module_1.FollowUpReminderModule],
    })
], FollowUpsModule);
//# sourceMappingURL=follow-ups.module.js.map