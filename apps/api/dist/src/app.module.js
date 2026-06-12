"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppModule = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const core_1 = require("@nestjs/core");
const app_controller_1 = require("./app.controller");
const app_service_1 = require("./app.service");
const auth_module_1 = require("./auth/auth.module");
const organizations_module_1 = require("./organizations/organizations.module");
const branches_module_1 = require("./branches/branches.module");
const departments_module_1 = require("./departments/departments.module");
const users_module_1 = require("./users/users.module");
const roles_module_1 = require("./roles/roles.module");
const permissions_module_1 = require("./permissions/permissions.module");
const patients_module_1 = require("./patients/patients.module");
const appointments_module_1 = require("./appointments/appointments.module");
const queues_module_1 = require("./queues/queues.module");
const consultations_module_1 = require("./consultations/consultations.module");
const diagnoses_module_1 = require("./diagnoses/diagnoses.module");
const vitals_module_1 = require("./vitals/vitals.module");
const prescriptions_module_1 = require("./prescriptions/prescriptions.module");
const documents_module_1 = require("./documents/documents.module");
const follow_ups_module_1 = require("./follow-ups/follow-ups.module");
const invoices_module_1 = require("./invoices/invoices.module");
const payments_module_1 = require("./payments/payments.module");
const messages_module_1 = require("./messages/messages.module");
const tasks_module_1 = require("./tasks/tasks.module");
const analytics_module_1 = require("./analytics/analytics.module");
const feedback_module_1 = require("./feedback/feedback.module");
const timeline_module_1 = require("./timeline/timeline.module");
const prisma_module_1 = require("./prisma/prisma.module");
const audit_module_1 = require("./common/services/audit.module");
const audit_interceptor_1 = require("./common/interceptors/audit.interceptor");
const timeline_interceptor_1 = require("./common/interceptors/timeline.interceptor");
const health_module_1 = require("./health/health.module");
const notification_module_1 = require("./notifications/notification.module");
const task_scheduler_module_1 = require("./tasks/task-scheduler.module");
const task_scheduler_service_1 = require("./tasks/task-scheduler.service");
let AppModule = class AppModule {
};
exports.AppModule = AppModule;
exports.AppModule = AppModule = __decorate([
    (0, common_1.Module)({
        imports: [
            config_1.ConfigModule.forRoot({ isGlobal: true }),
            prisma_module_1.PrismaModule,
            audit_module_1.AuditModule,
            auth_module_1.AuthModule,
            organizations_module_1.OrganizationsModule,
            branches_module_1.BranchesModule,
            departments_module_1.DepartmentsModule,
            users_module_1.UsersModule,
            roles_module_1.RolesModule,
            permissions_module_1.PermissionsModule,
            patients_module_1.PatientsModule,
            appointments_module_1.AppointmentsModule,
            queues_module_1.QueuesModule,
            consultations_module_1.ConsultationsModule,
            diagnoses_module_1.DiagnosesModule,
            vitals_module_1.VitalsModule,
            prescriptions_module_1.PrescriptionsModule,
            documents_module_1.DocumentsModule,
            follow_ups_module_1.FollowUpsModule,
            invoices_module_1.InvoicesModule,
            payments_module_1.PaymentsModule,
            messages_module_1.MessagesModule,
            tasks_module_1.TasksModule,
            analytics_module_1.AnalyticsModule,
            feedback_module_1.FeedbackModule,
            timeline_module_1.TimelineModule,
            health_module_1.HealthModule,
            notification_module_1.NotificationModule,
            task_scheduler_module_1.TaskSchedulerModule,
        ],
        controllers: [app_controller_1.AppController],
        providers: [
            app_service_1.AppService,
            task_scheduler_service_1.TaskSchedulerService,
            {
                provide: core_1.APP_INTERCEPTOR,
                useClass: audit_interceptor_1.AuditInterceptor,
            },
            {
                provide: core_1.APP_INTERCEPTOR,
                useClass: timeline_interceptor_1.TimelineInterceptor,
            },
        ],
    })
], AppModule);
//# sourceMappingURL=app.module.js.map