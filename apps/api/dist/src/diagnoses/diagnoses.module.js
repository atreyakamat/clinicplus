"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DiagnosesModule = void 0;
const common_1 = require("@nestjs/common");
const diagnoses_controller_1 = require("./diagnoses.controller");
const diagnoses_service_1 = require("./diagnoses.service");
let DiagnosesModule = class DiagnosesModule {
};
exports.DiagnosesModule = DiagnosesModule;
exports.DiagnosesModule = DiagnosesModule = __decorate([
    (0, common_1.Module)({
        controllers: [diagnoses_controller_1.DiagnosesController],
        providers: [diagnoses_service_1.DiagnosesService],
    })
], DiagnosesModule);
//# sourceMappingURL=diagnoses.module.js.map