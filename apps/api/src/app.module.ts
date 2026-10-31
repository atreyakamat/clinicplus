import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { validateEnv } from './config/env.validation';
import { AuthModule } from './auth/auth.module';
import { OrganizationsModule } from './organizations/organizations.module';
import { BranchesModule } from './branches/branches.module';
import { DepartmentsModule } from './departments/departments.module';
import { UsersModule } from './users/users.module';
import { RolesModule } from './roles/roles.module';
import { PermissionsModule } from './permissions/permissions.module';
import { PatientsModule } from './patients/patients.module';
import { AppointmentsModule } from './appointments/appointments.module';
import { QueuesModule } from './queues/queues.module';
import { ConsultationsModule } from './consultations/consultations.module';
import { DiagnosesModule } from './diagnoses/diagnoses.module';
import { VitalsModule } from './vitals/vitals.module';
import { PrescriptionsModule } from './prescriptions/prescriptions.module';
import { DocumentsModule } from './documents/documents.module';
import { FollowUpsModule } from './follow-ups/follow-ups.module';
import { InvoicesModule } from './invoices/invoices.module';
import { PaymentsModule } from './payments/payments.module';
import { MessagesModule } from './messages/messages.module';
import { TasksModule } from './tasks/tasks.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { FeedbackModule } from './feedback/feedback.module';
import { TimelineModule } from './timeline/timeline.module';
import { PrismaModule } from './prisma/prisma.module';
import { AuditModule } from './common/services/audit.module';
import { AuditInterceptor } from './common/interceptors/audit.interceptor';
import { TimelineInterceptor } from './common/interceptors/timeline.interceptor';
import { HealthModule } from './health/health.module';
import { NotificationModule } from './notifications/notification.module';
import { TaskSchedulerModule } from './tasks/task-scheduler.module';
import { BackupModule } from './backup/backup.module';
import { TenantModule } from './common/tenant/tenant.module';
import { MailModule } from './common/mail/mail.module';
import { StaffInvitationsModule } from './staff-invitations/staff-invitations.module';
import { AuditLogsModule } from './audit-logs/audit-logs.module';
import { SubscriptionModule } from './subscription/subscription.module';
import { PortalModule } from './portal/portal.module';
import { DoctorsModule } from './doctors/doctors.module';
import { ClinicSettingsModule } from './clinic-settings/clinic-settings.module';
import { ClinicalModule } from './clinical/clinical.module';
import { StorageModule } from './storage/storage.module';
import { ReviewsModule } from './reviews/reviews.module';
import { CampaignsModule } from './campaigns/campaigns.module';
import { ReportsModule } from './reports/reports.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        throttlers: [{ name: 'default', ttl: 60_000, limit: 600 }],
        skipIf: () => config.get('NODE_ENV') === 'test',
      }),
    }),
    PrismaModule,
    TenantModule,
    MailModule,
    AuditModule,
    AuditLogsModule,
    AuthModule,
    OrganizationsModule,
    BranchesModule,
    DepartmentsModule,
    UsersModule,
    RolesModule,
    PermissionsModule,
    StaffInvitationsModule,
    PatientsModule,
    AppointmentsModule,
    QueuesModule,
    ConsultationsModule,
    DiagnosesModule,
    VitalsModule,
    PrescriptionsModule,
    DocumentsModule,
    FollowUpsModule,
    InvoicesModule,
    PaymentsModule,
    MessagesModule,
    TasksModule,
    AnalyticsModule,
    FeedbackModule,
    TimelineModule,
    HealthModule,
    NotificationModule,
    TaskSchedulerModule,
    BackupModule,
    DoctorsModule,
    ClinicSettingsModule,
    ClinicalModule,
    StorageModule,
    ReviewsModule,
    CampaignsModule,
    ReportsModule,
    SubscriptionModule,
    PortalModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
    { provide: APP_INTERCEPTOR, useClass: TimelineInterceptor },
  ],
})
export class AppModule {}
