import { Module } from '@nestjs/common';
import { StaffInvitationsController } from './staff-invitations.controller';
import { StaffInvitationsService } from './staff-invitations.service';

@Module({
  controllers: [StaffInvitationsController],
  providers: [StaffInvitationsService],
})
export class StaffInvitationsModule {}
