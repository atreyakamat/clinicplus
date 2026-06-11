import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  Request,
} from '@nestjs/common';
import { StaffInvitationsService } from './staff-invitations.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { Permissions } from '../auth/decorators/permissions.decorator';

@Controller('api/v1/staff-invitations')
export class StaffInvitationsController {
  constructor(
    private readonly staffInvitationsService: StaffInvitationsService,
  ) {}

  @Post('invite')
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Permissions('staff:invite')
  async invite(@Body() data: any, @Request() req) {
    data.organizationId = req.user.organizationId;
    data.branchId = req.user.branchId;
    return this.staffInvitationsService.create(data);
  }

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Permissions('staff:read')
  async findAll(@Request() req) {
    return this.staffInvitationsService.findAll(req.user.organizationId);
  }

  @Get(':token')
  async findByToken(@Param('token') token: string) {
    return this.staffInvitationsService.findByToken(token);
  }

  @Post('accept/:token')
  async accept(@Param('token') token: string, @Body() userData: any) {
    return this.staffInvitationsService.accept(token, userData);
  }
}
