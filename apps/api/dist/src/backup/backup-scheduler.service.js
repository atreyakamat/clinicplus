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
var BackupSchedulerService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.BackupSchedulerService = void 0;
const common_1 = require("@nestjs/common");
const backup_service_1 = require("./backup.service");
let BackupSchedulerService = BackupSchedulerService_1 = class BackupSchedulerService {
    backupService;
    logger = new common_1.Logger(BackupSchedulerService_1.name);
    backupInterval;
    constructor(backupService) {
        this.backupService = backupService;
    }
    start() {
        this.logger.log('Starting backup scheduler');
        this.performBackup();
        const now = new Date();
        const nextRun = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 2, 0, 0);
        const msUntilNextRun = nextRun.getTime() - now.getTime();
        this.backupInterval = setInterval(() => {
            this.performBackup();
        }, 24 * 60 * 60 * 1000);
        clearInterval(this.backupInterval);
        this.backupInterval = setTimeout(() => {
            this.performBackup();
            this.backupInterval = setInterval(() => {
                this.performBackup();
            }, 24 * 60 * 60 * 1000);
        }, msUntilNextRun);
    }
    stop() {
        this.logger.log('Stopping backup scheduler');
        if (this.backupInterval) {
            clearInterval(this.backupInterval);
        }
    }
    async performBackup() {
        try {
            this.logger.log('Starting scheduled backup');
            const backupPath = await this.backupService.createBackup();
            this.logger.log(`Scheduled backup completed: ${backupPath}`);
        }
        catch (error) {
            this.logger.error(`Failed to perform scheduled backup: ${error.message}`);
        }
    }
    async triggerBackupNow() {
        this.logger.log('Manual backup triggered');
        return this.backupService.createBackup();
    }
};
exports.BackupSchedulerService = BackupSchedulerService;
exports.BackupSchedulerService = BackupSchedulerService = BackupSchedulerService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [backup_service_1.BackupService])
], BackupSchedulerService);
//# sourceMappingURL=backup-scheduler.service.js.map