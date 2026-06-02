import { Controller, Get, Post, Body, Patch, Param, Request, UseGuards } from '@nestjs/common';
import { QueuesService } from './queues.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('api/v1/queues')
@UseGuards(JwtAuthGuard)
export class QueuesController {
  constructor(private readonly queuesService: QueuesService) {}

  @Get('live')
  getLiveQueue(@Request() req) {
    return this.queuesService.getLiveQueue(req.user.organizationId, req.user.branchId);
  }

  @Post('check-in')
  checkIn(@Body() data: { appointmentId: string }, @Request() req) {
    return this.queuesService.checkIn(data.appointmentId, req.user.organizationId, req.user.branchId);
  }

  @Patch('entries/:id/status')
  updateStatus(
    @Param('id') id: string, 
    @Body() data: { status: 'WAITING' | 'CALLED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED' }
  ) {
    return this.queuesService.updateEntryStatus(id, data.status);
  }
}
