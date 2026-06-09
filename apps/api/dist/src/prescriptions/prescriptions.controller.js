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
exports.PrescriptionsController = void 0;
const common_1 = require("@nestjs/common");
const prescriptions_service_1 = require("./prescriptions.service");
const jwt_auth_guard_1 = require("../auth/guards/jwt-auth.guard");
const pdf_service_1 = require("../common/services/pdf.service");
const organizations_service_1 = require("../organizations/organizations.service");
let PrescriptionsController = class PrescriptionsController {
    prescriptionsService;
    pdfService;
    organizationsService;
    constructor(prescriptionsService, pdfService, organizationsService) {
        this.prescriptionsService = prescriptionsService;
        this.pdfService = pdfService;
        this.organizationsService = organizationsService;
    }
    create(data, req) {
        data.organizationId = req.user.organizationId;
        data.branchId = req.user.branchId;
        data.doctorId = req.user.id;
        return this.prescriptionsService.create(data);
    }
    async download(id, req, res) {
        const rx = await this.prescriptionsService.findOne(id, req.user.organizationId, req.user.branchId);
        const org = await this.organizationsService.findOne(req.user.organizationId);
        const buffer = await this.pdfService.generatePrescriptionPdf(rx, org);
        res.set({
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment; filename="prescription-${rx.id.split('-')[0]}.pdf"`,
            'Content-Length': buffer.length,
        });
        res.end(buffer);
    }
    findAll(patientId, req) {
        return this.prescriptionsService.findAll(req.user.organizationId, req.user.branchId, patientId);
    }
    findOne(id, req) {
        return this.prescriptionsService.findOne(id, req.user.organizationId, req.user.branchId);
    }
};
exports.PrescriptionsController = PrescriptionsController;
__decorate([
    (0, common_1.Post)(),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Request)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], PrescriptionsController.prototype, "create", null);
__decorate([
    (0, common_1.Get)(':id/download'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Request)()),
    __param(2, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", Promise)
], PrescriptionsController.prototype, "download", null);
__decorate([
    (0, common_1.Get)(),
    __param(0, (0, common_1.Query)('patientId')),
    __param(1, (0, common_1.Request)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], PrescriptionsController.prototype, "findAll", null);
__decorate([
    (0, common_1.Get)(':id'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Request)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], PrescriptionsController.prototype, "findOne", null);
exports.PrescriptionsController = PrescriptionsController = __decorate([
    (0, common_1.Controller)('api/v1/prescriptions'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __metadata("design:paramtypes", [prescriptions_service_1.PrescriptionsService,
        pdf_service_1.PdfService,
        organizations_service_1.OrganizationsService])
], PrescriptionsController);
//# sourceMappingURL=prescriptions.controller.js.map