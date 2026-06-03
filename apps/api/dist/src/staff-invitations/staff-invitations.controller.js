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
exports.StaffInvitationsController = void 0;
const common_1 = require("@nestjs/common");
const staff_invitations_service_1 = require("./staff-invitations.service");
const jwt_auth_guard_1 = require("../auth/guards/jwt-auth.guard");
let StaffInvitationsController = class StaffInvitationsController {
    staffInvitationsService;
    constructor(staffInvitationsService) {
        this.staffInvitationsService = staffInvitationsService;
    }
    async invite(data, req) {
        data.organizationId = req.user.organizationId;
        data.branchId = req.user.branchId;
        return this.staffInvitationsService.create(data);
    }
    async findAll(req) {
        return this.staffInvitationsService.findAll(req.user.organizationId);
    }
    async findByToken(token) {
        return this.staffInvitationsService.findByToken(token);
    }
    async accept(token, userData) {
        return this.staffInvitationsService.accept(token, userData);
    }
};
exports.StaffInvitationsController = StaffInvitationsController;
__decorate([
    (0, common_1.Post)('invite'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Request)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], StaffInvitationsController.prototype, "invite", null);
__decorate([
    (0, common_1.Get)(),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __param(0, (0, common_1.Request)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], StaffInvitationsController.prototype, "findAll", null);
__decorate([
    (0, common_1.Get)(':token'),
    __param(0, (0, common_1.Param)('token')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], StaffInvitationsController.prototype, "findByToken", null);
__decorate([
    (0, common_1.Post)('accept/:token'),
    __param(0, (0, common_1.Param)('token')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], StaffInvitationsController.prototype, "accept", null);
exports.StaffInvitationsController = StaffInvitationsController = __decorate([
    (0, common_1.Controller)('api/v1/staff-invitations'),
    __metadata("design:paramtypes", [staff_invitations_service_1.StaffInvitationsService])
], StaffInvitationsController);
//# sourceMappingURL=staff-invitations.controller.js.map