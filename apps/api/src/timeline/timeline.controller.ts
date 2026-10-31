import { Controller, Get, Query, Request, UseGuards } from '@nestjs/common';
import { IsIn, IsOptional, IsString, IsUUID } from 'class-validator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { PaginationQueryDto } from '../common/pagination';
import { TimelineService } from './timeline.service';
import { TIMELINE_CATEGORIES } from './timeline.events';

export class TimelineQueryDto extends PaginationQueryDto {
  @IsUUID()
  patientId: string;

  @IsOptional()
  @IsString()
  @IsIn([...TIMELINE_CATEGORIES, ...TIMELINE_CATEGORIES.map((c) => c.toLowerCase())])
  category?: string;
}

@Controller('api/v1/timeline')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class TimelineController {
  constructor(private readonly timelineService: TimelineService) {}

  /** Paginated, permission-filtered patient timeline. */
  @Get()
  @Permissions('timeline.view', 'patients.view')
  findForPatient(@Query() query: TimelineQueryDto, @Request() req) {
    return this.timelineService.findForPatient(query.patientId, req.user, query);
  }

  /** Categories the caller is allowed to see (drives the UI filter chips). */
  @Get('categories')
  @Permissions('timeline.view')
  categories(@Request() req) {
    return this.timelineService.allowedCategories(req.user);
  }
}
