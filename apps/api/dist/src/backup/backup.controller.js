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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BackupController = void 0;
const common_1 = require("@nestjs/common");
const backup_service_1 = require("./backup.service");
const backup_scheduler_service_1 = require("./backup-scheduler.service");
const jwt_auth_guard_1 = require("../auth/guards/jwt-auth.guard");
const roles_guard_1 = require("../auth/guards/roles.guard");
const permissions_guard_1 = require("../auth/guards/permissions.guard");
const permissions_decorator_1 = require("../auth/decorators/permissions.decorator");
let BackupController = class BackupController {
    backupService;
    backupSchedulerService;
    constructor(backupService, backupSchedulerService) {
        this.backupService = backupService;
        this.backupSchedulerService = backupSchedulerService;
    }
    async createBackup(req) {
        const backupPath = await this.backupService.createBackup();
        return {
            message: 'Backup created successfully',
            backupPath: backupPath,
            timestamp: new Date().toISOString(),
        };
    }
    async restoreBackup(req, filename) {
        if (!filename.match(/^clinicos-backup-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.sql$/)) {
            throw new Error('Invalid backup filename');
        }
        const backupPath = this.backupService.getBackupPath(filename);
        await this.backupService.restoreBackup(backupPath);
        return {
            message: 'Backup restored successfully',
            backupFile: filename,
            timestamp: new Date().toISOString(),
        };
    }
    async listBackups(req) {
        const backups = await this.backupService.listBackups();
        return {
            backups: backups.map((backup) => ({
                name: backup.name,
                size: backup.size,
                date: backup.date.toISOString(),
            })),
            count: backups.length,
        };
    }
    async getBackupStats(req) {
        const stats = await this.backupService.getBackupStats();
        return stats;
    }
    async startScheduler(req) {
        this.backupSchedulerService.start();
        return { message: 'Backup scheduler started' };
    }
    async stopScheduler(req) {
        this.backupSchedulerService.stop();
        return { message: 'Backup scheduler stopped' };
    }
    async downloadBackup(filename, res) {
        if (!filename.match(/^clinicos-backup-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.sql$/)) {
            throw new Error('Invalid backup filename');
        }
        const backupPath = this.backupService.getBackupPath(filename);
        try {
            return res.download(backupPath, filename);
        }
        catch (error) {
            throw new Error(`Backup file not found: ${filename}`);
        }
    }
};
exports.BackupController = BackupController;
__decorate([
    (0, common_1.Post)('create'),
    (0, permissions_decorator_1.Permissions)('backup:create'),
    (0, common_1.HttpCode)(200),
    __param(0, (0, common_1.Request)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], BackupController.prototype, "createBackup", null);
__decorate([
    (0, common_1.Post)('restore/:filename'),
    (0, permissions_decorator_1.Permissions)('backup:restore'),
    __param(0, (0, common_1.Request)()),
    __param(1, (0, common_1.Param)('filename')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], BackupController.prototype, "restoreBackup", null);
__decorate([
    (0, common_1.Get)('list'),
    (0, permissions_decorator_1.Permissions)('backup:read'),
    __param(0, (0, common_1.Request)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], BackupController.prototype, "listBackups", null);
__decorate([
    (0, common_1.Get)('stats'),
    (0, permissions_decorator_1.Permissions)('backup:read'),
    __param(0, (0, common_1.Request)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], BackupController.prototype, "getBackupStats", null);
__decorate([
    (0, common_1.Post)('scheduler/start'),
    (0, permissions_decorator_1.Permissions)('backup:manage'),
    __param(0, (0, common_1.Request)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], BackupController.prototype, "startScheduler", null);
__decorate([
    (0, common_1.Post)('scheduler/stop'),
    (0, permissions_decorator_1.Permissions)('backup:manage'),
    __param(0, (0, common_1.Request)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], BackupController.prototype, "stopScheduler", null);
__decorate([
    (0, common_1.Get)('download/:filename'),
    (0, permissions_decorator_1.Permissions)('backup:read'),
    __param(0, (0, common_1.Param)('filename')),
    __param(1, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], BackupController.prototype, "downloadBackup", null);
exports.BackupController = BackupController = __decorate([
    (0, common_1.Controller)('api/v1/backup'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard, permissions_guard_1.PermissionsGuard),
    __metadata("design:paramtypes", [backup_service_1.BackupService,
        backup_scheduler_service_1.BackupSchedulerService])
], BackupController);
//# sourceMappingURL=backup.controller.js.map