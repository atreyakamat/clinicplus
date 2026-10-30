import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { FollowUpsService } from './follow-ups.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { Permissions } from '../auth/decorators/permissions.decorator';
import {
  AddFollowUpOutcomeDto,
  CreateFollowUpDto,
  FollowUpMetricsQueryDto,
  ListFollowUpsQueryDto,
  UpdateFollowUpDto,
  UpdateFollowUpStatusDto,
} from './dto/follow-up.dto';

@Controller('api/v1/follow-ups')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class FollowUpsController {
  constructor(private readonly followUpsService: FollowUpsService) {}

  @Post()
  @Permissions('follow_ups.create')
  create(@Body() dto: CreateFollowUpDto, @Request() req) {
    return this.followUpsService.create(dto, req.user);
  }

  @Get()
  @Permissions('follow_ups.view')
  findAll(@Query() query: ListFollowUpsQueryDto, @Request() req) {
    return this.followUpsService.findAll(query, req.user);
  }

  @Get('metrics')
  @Permissions('follow_ups.view')
  metrics(@Query() query: FollowUpMetricsQueryDto, @Request() req) {
    return this.followUpsService.metrics(query, req.user);
  }

  @Get('doctors')
  @Permissions('follow_ups.view')
  doctors(@Request() req) {
    return this.followUpsService.doctors(req.user);
  }

  @Get(':id')
  @Permissions('follow_ups.view')
  findOne(@Param('id') id: string, @Request() req) {
    return this.followUpsService.findOne(id, req.user);
  }

  @Patch(':id')
  @Permissions('follow_ups.update')
  update(@Param('id') id: string, @Body() dto: UpdateFollowUpDto, @Request() req) {
    return this.followUpsService.update(id, dto, req.user);
  }

  @Patch(':id/status')
  @Permissions('follow_ups.update')
  updateStatus(@Param('id') id: string, @Body() dto: UpdateFollowUpStatusDto, @Request() req) {
    return this.followUpsService.updateStatus(id, dto.status, req.user);
  }

  @Post(':id/outcomes')
  @Permissions('follow_ups.update')
  addOutcome(@Param('id') id: string, @Body() dto: AddFollowUpOutcomeDto, @Request() req) {
    return this.followUpsService.addOutcome(id, dto, req.user);
  }
}
