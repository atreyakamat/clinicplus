import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PaymentsModule } from '../payments/payments.module';
import { DoctorsModule } from '../doctors/doctors.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { MessagesModule } from '../messages/messages.module';
import { PdfService } from '../common/services/pdf.service';
import { PortalAuthService } from './portal-auth.service';
import { PortalService } from './portal.service';
import { PortalAuthGuard } from './portal-auth.guard';
import { PortalAuthController } from './portal-auth.controller';
import { PortalController } from './portal.controller';
import { PortalAdminController } from './portal-admin.controller';

/**
 * Patient self-service portal.
 *
 * Auth is deliberately isolated from staff auth: a private JwtModule issues and
 * verifies patient tokens (same JWT_SECRET, but `typ: 'patient'` and no `sub`),
 * so staff tokens and patient tokens cannot be used interchangeably.
 */
@Module({
  imports: [
    PaymentsModule, // StripeService + LedgerService (single instances, mockable in tests)
    DoctorsModule, // ScheduleService (slot rules reused for self-booking)
    OrganizationsModule, // org branding for PDFs / portal shell
    MessagesModule, // SmsService for OTP delivery
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({ secret: config.getOrThrow<string>('JWT_SECRET') }),
    }),
  ],
  controllers: [PortalAuthController, PortalController, PortalAdminController],
  providers: [PortalAuthService, PortalService, PortalAuthGuard, PdfService],
})
export class PortalModule {}
