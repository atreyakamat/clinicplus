import { Controller, Get, Post, Delete, Body, Param, UseGuards, Request, HttpCode, Ip, Headers } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { StaffInvitationsService } from './staff-invitations.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { InviteStaffDto, AcceptInvitationDto } from './dto/invitation.dto';

@Controller('api/v1/staff-invitations')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class StaffInvitationsController {
  constructor(private readonly staffInvitationsService: StaffInvitationsService) {}

  @Post('invite')
  @Permissions('users.invite')
  async invite(@Body() data: InviteStaffDto, @Request() req) {
    return this.staffInvitationsService.create(data, req.user);
  }

  @Get()
  @Permissions('users.view')
  async findAll(@Request() req) {
    return this.staffInvitationsService.findAll(req.user);
  }

  @Delete(':id')
  @Permissions('users.invite')
  async revoke(@Param('id') id: string, @Request() req) {
    return this.staffInvitationsService.revoke(id, req.user);
  }
}

/**
 * Public invitation endpoints (no login). The 64-hex token from the invite link
 * is the credential; it is stored hashed and is single-use.
 */
@Controller('api/v1/staff-invitations')
export class PublicStaffInvitationsController {
  constructor(private readonly staffInvitationsService: StaffInvitationsService) {}

  @Get('token/:token')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async findByToken(@Param('token') token: string) {
    return this.staffInvitationsService.findByToken(token);
  }

  /** Invitee sets name + password; returns a logged-in session like /auth/login. */
  @Post('accept/:token')
  @HttpCode(201)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async accept(
    @Param('token') token: string,
    @Body() userData: AcceptInvitationDto,
    @Ip() ip: string,
    @Headers('user-agent') userAgent: string,
  ) {
    return this.staffInvitationsService.accept(token, userData, { ipAddress: ip, userAgent });
  }
}
