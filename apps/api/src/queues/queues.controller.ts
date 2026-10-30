import { Body, Controller, Get, HttpCode, Param, Patch, Post, Put, Request, UseGuards } from '@nestjs/common';
import { QueuesService } from './queues.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { CallNextDto, CheckInDto, ReorderDto, UpdateEntryDto, UpdateEntryStatusDto, WalkInDto } from './dto';

@Controller('api/v1/queues')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class QueuesController {
  constructor(private readonly queuesService: QueuesService) {}

  /** Today's queue for the active branch (active entries ordered by priority then token). */
  @Get('live')
  @Permissions('queues.view')
  getLiveQueue(@Request() req) {
    return this.queuesService.getLiveQueue(req.user);
  }

  /** Read-only, privacy-reduced payload for a waiting-room TV. Poll every ~5s. */
  @Get('display')
  @Permissions('queues.view')
  getDisplay(@Request() req) {
    return this.queuesService.getDisplay(req.user);
  }

  @Post('check-in')
  @Permissions('queues.update')
  checkIn(@Body() dto: CheckInDto, @Request() req) {
    return this.queuesService.checkIn(req.user, dto);
  }

  @Post('walk-in')
  @Permissions('queues.update', 'appointments.create')
  walkIn(@Body() dto: WalkInDto, @Request() req) {
    return this.queuesService.walkIn(req.user, dto);
  }

  @Post('call-next')
  @HttpCode(200)
  @Permissions('queues.update')
  callNext(@Body() dto: CallNextDto, @Request() req) {
    return this.queuesService.callNext(req.user, dto);
  }

  @Put('reorder')
  @Permissions('queues.update')
  reorder(@Body() dto: ReorderDto, @Request() req) {
    return this.queuesService.reorder(req.user, dto);
  }

  @Patch('entries/:id')
  @Permissions('queues.update')
  updateEntry(@Param('id') id: string, @Body() dto: UpdateEntryDto, @Request() req) {
    return this.queuesService.updateEntry(req.user, id, dto);
  }

  @Patch('entries/:id/status')
  @Permissions('queues.update')
  updateStatus(@Param('id') id: string, @Body() dto: UpdateEntryStatusDto, @Request() req) {
    return this.queuesService.updateStatus(req.user, id, dto.status);
  }
}
