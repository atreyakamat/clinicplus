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
exports.QueuesController = void 0;
const common_1 = require("@nestjs/common");
const queues_service_1 = require("./queues.service");
const jwt_auth_guard_1 = require("../auth/guards/jwt-auth.guard");
const roles_guard_1 = require("../auth/guards/roles.guard");
const permissions_guard_1 = require("../auth/guards/permissions.guard");
let QueuesController = class QueuesController {
    queuesService;
    constructor(queuesService) {
        this.queuesService = queuesService;
    }
    getLiveQueue(req) {
        return this.queuesService.getLiveQueue(req.user.organizationId, req.user.branchId);
    }
    checkIn(data, req) {
        return this.queuesService.checkIn(data.appointmentId, req.user.organizationId, req.user.branchId);
    }
    updateStatus(id, data) {
        return this.queuesService.updateEntryStatus(id, data.status);
    }
};
exports.QueuesController = QueuesController;
__decorate([
    (0, common_1.Get)('live'),
    __param(0, (0, common_1.Request)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], QueuesController.prototype, "getLiveQueue", null);
__decorate([
    (0, common_1.Post)('check-in'),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Request)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], QueuesController.prototype, "checkIn", null);
__decorate([
    (0, common_1.Patch)('entries/:id/status'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], QueuesController.prototype, "updateStatus", null);
exports.QueuesController = QueuesController = __decorate([
    (0, common_1.Controller)('api/v1/queues'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard, permissions_guard_1.PermissionsGuard),
    __metadata("design:paramtypes", [queues_service_1.QueuesService])
], QueuesController);
//# sourceMappingURL=queues.controller.js.map