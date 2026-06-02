import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
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

@Module({
  imports: [OrganizationsModule, BranchesModule, DepartmentsModule, UsersModule, RolesModule, PermissionsModule, PatientsModule, AppointmentsModule, QueuesModule, ConsultationsModule, DiagnosesModule, VitalsModule, PrescriptionsModule, DocumentsModule, FollowUpsModule, InvoicesModule, PaymentsModule, MessagesModule, TasksModule, AnalyticsModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
