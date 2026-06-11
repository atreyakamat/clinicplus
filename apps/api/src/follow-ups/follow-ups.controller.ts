import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  UseGuards,
  Request,
} from '@nestjs/common';
import { FollowUpsService } from './follow-ups.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { Permissions } from '../auth/decorators/permissions.decorator';

@Controller('api/v1/follow-ups')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class FollowUpsController {
  constructor(private readonly followUpsService: FollowUpsService) {}

  @Post()
  @Permissions('followups:create')
  create(@Body() data: any, @Request() req) {
    data.organizationId = req.user.organizationId;
    data.branchId = req.user.branchId;
    data.doctorId = req.user.id;
    return this.followUpsService.create(data);
  }

  @Get()
  @Permissions('followups:read')
  findAll(@Request() req) {
    return this.followUpsService.findAll(
      req.user.organizationId,
      req.user.branchId,
    );
  }

  @Patch(':id/status')
  @Permissions('followups:update')
  updateStatus(
    @Param('id') id: string,
    @Body('status') status: string,
    @Request() req,
  ) {
    return this.followUpsService.updateStatus(
      id,
      status,
      req.user.organizationId,
    );
  }

  @Post(':id/outcomes')
  @Permissions('followups:update')
  addOutcome(@Param('id') id: string, @Body() data: any, @Request() req) {
    data.organizationId = req.user.organizationId;
    data.branchId = req.user.branchId;
    return this.followUpsService.addOutcome(id, data, req.user.organizationId);
  }
}
