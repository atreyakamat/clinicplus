import { Controller, Get, Query, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { TimelineService } from './timeline.service';

@Controller('api/v1/timeline')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class TimelineController {
  constructor(private readonly timelineService: TimelineService) {}

  @Get()
  @Permissions('timeline:read')
  findAllByPatient(@Query('patientId') patientId: string, @Request() req) {
    return this.timelineService.findAllByPatient(
      patientId,
      req.user.organizationId,
    );
  }
}
