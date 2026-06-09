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
Object.defineProperty(exports, "__esModule", { value: true });
exports.TimelineInterceptor = void 0;
const common_1 = require("@nestjs/common");
const operators_1 = require("rxjs/operators");
const timeline_service_1 = require("../../timeline/timeline.service");
let TimelineInterceptor = class TimelineInterceptor {
    timelineService;
    constructor(timelineService) {
        this.timelineService = timelineService;
    }
    intercept(context, next) {
        const request = context.switchToHttp().getRequest();
        const { user, method, url, body } = request;
        if (!user)
            return next.handle();
        return next.handle().pipe((0, operators_1.tap)((data) => {
            if (['POST', 'PATCH', 'PUT'].includes(method)) {
                const patientId = body.patientId ||
                    data?.patientId ||
                    (url.includes('patients/') ? url.split('/')[4] : null);
                if (patientId && patientId.length === 36) {
                    const module = url.split('/')[3];
                    let eventType = '';
                    let title = '';
                    switch (module) {
                        case 'appointments':
                            eventType =
                                method === 'POST'
                                    ? 'APPOINTMENT_BOOKED'
                                    : 'APPOINTMENT_UPDATED';
                            title =
                                method === 'POST' ? 'New Appointment' : 'Appointment Updated';
                            break;
                        case 'consultations':
                            eventType =
                                method === 'POST'
                                    ? 'CONSULTATION_STARTED'
                                    : 'CONSULTATION_UPDATED';
                            title =
                                method === 'POST'
                                    ? 'Consultation Started'
                                    : 'Consultation Updated';
                            break;
                        case 'prescriptions':
                            eventType = 'PRESCRIPTION_GENERATED';
                            title = 'Prescription Issued';
                            break;
                        case 'invoices':
                            eventType = 'INVOICE_GENERATED';
                            title = 'Billing Generated';
                            break;
                        case 'payments':
                            eventType = 'PAYMENT_COLLECTED';
                            title = 'Payment Received';
                            break;
                        default:
                            return;
                    }
                    this.timelineService.record({
                        organizationId: user.organizationId,
                        patientId,
                        eventType,
                        eventCategory: 'SYSTEM',
                        title,
                        description: `Action performed via ${module} module.`,
                        createdBy: user.id,
                        metadata: {
                            method,
                            url,
                            body: method === 'POST' ? body : undefined,
                        },
                    });
                }
            }
        }));
    }
};
exports.TimelineInterceptor = TimelineInterceptor;
exports.TimelineInterceptor = TimelineInterceptor = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [timeline_service_1.TimelineService])
], TimelineInterceptor);
//# sourceMappingURL=timeline.interceptor.js.map