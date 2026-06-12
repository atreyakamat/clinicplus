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
var TaskSchedulerService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.TaskSchedulerService = void 0;
const common_1 = require("@nestjs/common");
const notification_service_1 = require("../notifications/notification.service");
let TaskSchedulerService = TaskSchedulerService_1 = class TaskSchedulerService {
    notificationService;
    logger = new common_1.Logger(TaskSchedulerService_1.name);
    notificationInterval;
    constructor(notificationService) {
        this.notificationService = notificationService;
    }
    start() {
        this.logger.log('Starting task scheduler');
        this.runNotificationJob();
        this.notificationInterval = setInterval(() => {
            this.runNotificationJob();
        }, 60 * 60 * 1000);
    }
    stop() {
        this.logger.log('Stopping task scheduler');
        if (this.notificationInterval) {
            clearInterval(this.notificationInterval);
        }
    }
    async runNotificationJob() {
        try {
            this.logger.log('Running scheduled notification job');
            await this.notificationService.sendScheduledNotifications();
            this.logger.log('Completed scheduled notification job');
        }
        catch (error) {
            this.logger.error('Failed to run scheduled notification job:', error);
        }
    }
};
exports.TaskSchedulerService = TaskSchedulerService;
exports.TaskSchedulerService = TaskSchedulerService = TaskSchedulerService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [notification_service_1.NotificationService])
], TaskSchedulerService);
//# sourceMappingURL=task-scheduler.service.js.map