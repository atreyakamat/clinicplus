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
exports.PaymentsController = void 0;
const common_1 = require("@nestjs/common");
const payments_service_1 = require("./payments.service");
const jwt_auth_guard_1 = require("../auth/guards/jwt-auth.guard");
const roles_guard_1 = require("../auth/guards/roles.guard");
const permissions_guard_1 = require("../auth/guards/permissions.guard");
const roles_decorator_1 = require("../auth/decorators/roles.decorator");
const permissions_decorator_1 = require("../auth/decorators/permissions.decorator");
const create_payment_dto_1 = require("./dto/create-payment.dto");
const refund_payment_dto_1 = require("./dto/refund-payment.dto");
let PaymentsController = class PaymentsController {
    paymentsService;
    constructor(paymentsService) {
        this.paymentsService = paymentsService;
    }
    async createPayment(createPaymentDto, req) {
        return this.paymentsService.createPayment(createPaymentDto, req.user.organizationId, req.user.branchId, req.user.id);
    }
    async getPaymentById(id, req) {
        return this.paymentsService.findPaymentById(id, req.user.organizationId, req.user.branchId);
    }
    async refundPayment(paymentId, refundPaymentDto, req) {
        return this.paymentsService.refundPayment(paymentId, refundPaymentDto, req.user.organizationId, req.user.branchId, req.user.id);
    }
    async getPaymentsByInvoice(invoiceId, req) {
        return this.paymentsService.getPaymentsByInvoice(invoiceId, req.user.organizationId, req.user.branchId);
    }
    async getPayments(req, skip = 0, take = 10) {
        return this.paymentsService.getPayments(req.user.organizationId, req.user.branchId, skip, take);
    }
    async countPayments(req) {
        return this.paymentsService.countPayments(req.user.organizationId, req.user.branchId);
    }
};
exports.PaymentsController = PaymentsController;
__decorate([
    (0, common_1.Post)(),
    (0, roles_decorator_1.Roles)('super-admin', 'organization-owner', 'clinic-admin', 'receptionist', 'accountant'),
    (0, permissions_decorator_1.Permissions)('payments:create'),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Request)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [create_payment_dto_1.CreatePaymentDto, Object]),
    __metadata("design:returntype", Promise)
], PaymentsController.prototype, "createPayment", null);
__decorate([
    (0, common_1.Get)(':id'),
    (0, roles_decorator_1.Roles)('super-admin', 'organization-owner', 'clinic-admin', 'receptionist', 'accountant'),
    (0, permissions_decorator_1.Permissions)('payments:view'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Request)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], PaymentsController.prototype, "getPaymentById", null);
__decorate([
    (0, common_1.Post)(':id/refund'),
    (0, roles_decorator_1.Roles)('super-admin', 'organization-owner', 'clinic-admin', 'receptionist', 'accountant'),
    (0, permissions_decorator_1.Permissions)('payments:refund'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Request)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, refund_payment_dto_1.RefundPaymentDto, Object]),
    __metadata("design:returntype", Promise)
], PaymentsController.prototype, "refundPayment", null);
__decorate([
    (0, common_1.Get)('invoice/:invoiceId'),
    (0, roles_decorator_1.Roles)('super-admin', 'organization-owner', 'clinic-admin', 'receptionist', 'accountant'),
    (0, permissions_decorator_1.Permissions)('payments:view'),
    __param(0, (0, common_1.Param)('invoiceId')),
    __param(1, (0, common_1.Request)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], PaymentsController.prototype, "getPaymentsByInvoice", null);
__decorate([
    (0, common_1.Get)(),
    (0, roles_decorator_1.Roles)('super-admin', 'organization-owner', 'clinic-admin', 'accountant'),
    (0, permissions_decorator_1.Permissions)('payments:view'),
    __param(0, (0, common_1.Request)()),
    __param(1, (0, common_1.Query)('skip')),
    __param(2, (0, common_1.Query)('take')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Number, Number]),
    __metadata("design:returntype", Promise)
], PaymentsController.prototype, "getPayments", null);
__decorate([
    (0, common_1.Get)('count'),
    (0, roles_decorator_1.Roles)('super-admin', 'organization-owner', 'clinic-admin', 'accountant'),
    (0, permissions_decorator_1.Permissions)('payments:view'),
    __param(0, (0, common_1.Request)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], PaymentsController.prototype, "countPayments", null);
exports.PaymentsController = PaymentsController = __decorate([
    (0, common_1.Controller)('api/v1/payments'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard, permissions_guard_1.PermissionsGuard),
    __metadata("design:paramtypes", [payments_service_1.PaymentsService])
], PaymentsController);
//# sourceMappingURL=payments.controller.js.map