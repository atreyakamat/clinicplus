import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PublicStaffInvitationsController, StaffInvitationsController } from './staff-invitations.controller';
import { StaffInvitationsService } from './staff-invitations.service';

@Module({
  imports: [AuthModule],
  // Public controller first so `token/:token` and `accept/:token` never hit the guarded routes.
  controllers: [PublicStaffInvitationsController, StaffInvitationsController],
  providers: [StaffInvitationsService],
  exports: [StaffInvitationsService],
})
export class StaffInvitationsModule {}
