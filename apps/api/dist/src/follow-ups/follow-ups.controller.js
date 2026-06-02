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
exports.FollowUpsController = void 0;
const common_1 = require("@nestjs/common");
const follow_ups_service_1 = require("./follow-ups.service");
const jwt_auth_guard_1 = require("../auth/guards/jwt-auth.guard");
let FollowUpsController = class FollowUpsController {
    followUpsService;
    constructor(followUpsService) {
        this.followUpsService = followUpsService;
    }
    create(data, req) {
        data.organizationId = req.user.organizationId;
        data.branchId = req.user.branchId;
        data.doctorId = req.user.id;
        return this.followUpsService.create(data);
    }
    findAll(req) {
        return this.followUpsService.findAll(req.user.organizationId, req.user.branchId);
    }
    updateStatus(id, status) {
        return this.followUpsService.updateStatus(id, status);
    }
    addOutcome(id, data, req) {
        data.organizationId = req.user.organizationId;
        data.branchId = req.user.branchId;
        return this.followUpsService.addOutcome(id, data);
    }
};
exports.FollowUpsController = FollowUpsController;
__decorate([
    (0, common_1.Post)(),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Request)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], FollowUpsController.prototype, "create", null);
__decorate([
    (0, common_1.Get)(),
    __param(0, (0, common_1.Request)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], FollowUpsController.prototype, "findAll", null);
__decorate([
    (0, common_1.Patch)(':id/status'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)('status')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], FollowUpsController.prototype, "updateStatus", null);
__decorate([
    (0, common_1.Post)(':id/outcomes'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Request)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", void 0)
], FollowUpsController.prototype, "addOutcome", null);
exports.FollowUpsController = FollowUpsController = __decorate([
    (0, common_1.Controller)('api/v1/follow-ups'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __metadata("design:paramtypes", [follow_ups_service_1.FollowUpsService])
], FollowUpsController);
//# sourceMappingURL=follow-ups.controller.js.map