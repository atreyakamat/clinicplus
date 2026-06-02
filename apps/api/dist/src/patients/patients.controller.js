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
exports.PatientsController = void 0;
const common_1 = require("@nestjs/common");
const patients_service_1 = require("./patients.service");
const jwt_auth_guard_1 = require("../auth/guards/jwt-auth.guard");
const sync_1 = require("csv-stringify/sync");
let PatientsController = class PatientsController {
    patientsService;
    constructor(patientsService) {
        this.patientsService = patientsService;
    }
    async exportCsv(req, res) {
        const patients = await this.patientsService.findAll(req.user.organizationId, req.user.branchId);
        const csvData = (0, sync_1.stringify)(patients, {
            header: true,
            columns: [
                { key: 'patientCode', header: 'Patient ID' },
                { key: 'firstName', header: 'First Name' },
                { key: 'lastName', header: 'Last Name' },
                { key: 'email', header: 'Email' },
                { key: 'phone', header: 'Phone' },
                { key: 'gender', header: 'Gender' },
                { key: 'dateOfBirth', header: 'DOB' },
            ],
        });
        res.set({
            'Content-Type': 'text/csv',
            'Content-Disposition': `attachment; filename="patients-${new Date().toISOString().split('T')[0]}.csv"`,
        });
        return res.send(csvData);
    }
    async importCsv(data, req) {
        const patientsToCreate = data.map(row => ({
            ...row,
            organizationId: req.user.organizationId,
            branchId: req.user.branchId,
            createdBy: req.user.id,
        }));
        return { imported: patientsToCreate.length };
    }
};
exports.PatientsController = PatientsController;
__decorate([
    (0, common_1.Get)('export/csv'),
    __param(0, (0, common_1.Request)()),
    __param(1, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], PatientsController.prototype, "exportCsv", null);
__decorate([
    (0, common_1.Post)('import/csv'),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Request)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Array, Object]),
    __metadata("design:returntype", Promise)
], PatientsController.prototype, "importCsv", null);
exports.PatientsController = PatientsController = __decorate([
    (0, common_1.Controller)('api/v1/patients'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __metadata("design:paramtypes", [patients_service_1.PatientsService])
], PatientsController);
//# sourceMappingURL=patients.controller.js.map