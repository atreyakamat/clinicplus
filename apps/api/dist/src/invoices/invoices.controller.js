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
exports.InvoicesController = void 0;
const common_1 = require("@nestjs/common");
const invoices_service_1 = require("./invoices.service");
const jwt_auth_guard_1 = require("../auth/guards/jwt-auth.guard");
const roles_guard_1 = require("../auth/guards/roles.guard");
const permissions_guard_1 = require("../auth/guards/permissions.guard");
const roles_decorator_1 = require("../auth/decorators/roles.decorator");
const permissions_decorator_1 = require("../auth/decorators/permissions.decorator");
const pdf_service_1 = require("../common/services/pdf.service");
const organizations_service_1 = require("../organizations/organizations.service");
let InvoicesController = class InvoicesController {
    invoicesService;
    pdfService;
    organizationsService;
    constructor(invoicesService, pdfService, organizationsService) {
        this.invoicesService = invoicesService;
        this.pdfService = pdfService;
        this.organizationsService = organizationsService;
    }
    create(data, req) {
        return this.invoicesService.create(data, req.user.organizationId, req.user.branchId, req.user.id);
    }
    async download(id, req, res) {
        const invoice = await this.invoicesService.findOne(id, req.user.organizationId, req.user.branchId);
        const org = await this.organizationsService.findOne(req.user.organizationId);
        const buffer = await this.pdfService.generateInvoicePdf(invoice, org);
        res.set({
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment; filename="invoice-${invoice.invoiceNumber}.pdf"`,
            'Content-Length': buffer.length,
        });
        res.end(buffer);
    }
    findAll(req) {
        return this.invoicesService.findAll(req.user.organizationId, req.user.branchId);
    }
    findOne(id, req) {
        return this.invoicesService.findOne(id, req.user.organizationId, req.user.branchId);
    }
    addPayment(id, data, req) {
        data.organizationId = req.user.organizationId;
        data.branchId = req.user.branchId;
        data.createdBy = req.user.id;
        return this.invoicesService.addPayment(id, data, req.user.organizationId, req.user.branchId);
    }
};
exports.InvoicesController = InvoicesController;
__decorate([
    (0, common_1.Post)(),
    (0, roles_decorator_1.Roles)('super-admin', 'organization-owner', 'clinic-admin', 'doctor', 'receptionist', 'accountant'),
    (0, permissions_decorator_1.Permissions)('invoices:create'),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Request)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], InvoicesController.prototype, "create", null);
__decorate([
    (0, common_1.Get)(':id/download'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Request)()),
    __param(2, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", Promise)
], InvoicesController.prototype, "download", null);
__decorate([
    (0, common_1.Get)(),
    __param(0, (0, common_1.Request)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], InvoicesController.prototype, "findAll", null);
__decorate([
    (0, common_1.Get)(':id'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Request)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], InvoicesController.prototype, "findOne", null);
__decorate([
    (0, common_1.Post)(':id/payments'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Request)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", void 0)
], InvoicesController.prototype, "addPayment", null);
exports.InvoicesController = InvoicesController = __decorate([
    (0, common_1.Controller)('api/v1/invoices'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard, permissions_guard_1.PermissionsGuard),
    __metadata("design:paramtypes", [invoices_service_1.InvoicesService,
        pdf_service_1.PdfService,
        organizations_service_1.OrganizationsService])
], InvoicesController);
//# sourceMappingURL=invoices.controller.js.map