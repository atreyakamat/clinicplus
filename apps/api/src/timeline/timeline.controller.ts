import { Controller, Get, Query, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TimelineService } from './timeline.service';

@Controller('api/v1/timeline')
@UseGuards(JwtAuthGuard)
export class TimelineController {
  constructor(private readonly timelineService: TimelineService) {}

  @Get()
  findAllByPatient(@Query('patientId') patientId: string, @Request() req) {
    return this.timelineService.findAllByPatient(
      patientId,
      req.user.organizationId,
    );
  }
}
