import { Body, Controller, HttpCode, Param, ParseUUIDPipe, Post, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { PortalService, StaffActor } from './portal.service';
import { EnablePortalDto } from './dto/portal.dto';

/**
 * Staff-facing portal administration. Uses the STAFF auth stack (JWT + RBAC) and
 * the `patients.portal` permission — it lives in the portal module (not patients)
 * to avoid touching patients ownership this round, but it is a staff action.
 */
@Controller('api/v1/portal/admin')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class PortalAdminController {
  constructor(private readonly portal: PortalService) {}

  private actor(req: any): StaffActor {
    return { id: req.user.id, organizationId: req.user.organizationId, branchId: req.user.branchId };
  }

  @Post('patients/:id/enable')
  @HttpCode(200)
  @Permissions('patients.portal')
  enable(@Param('id', ParseUUIDPipe) id: string, @Body() dto: EnablePortalDto, @Request() req) {
    return this.portal.enablePortal(this.actor(req), id, dto);
  }

  @Post('patients/:id/disable')
  @HttpCode(200)
  @Permissions('patients.portal')
  disable(@Param('id', ParseUUIDPipe) id: string, @Request() req) {
    return this.portal.disablePortal(this.actor(req), id);
  }
}
