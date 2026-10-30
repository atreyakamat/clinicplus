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
import { FeedbackService } from './feedback.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { CreateFeedbackDto, UpdateFeedbackStatusDto } from './dto/feedback.dto';

@Controller('api/v1/feedback')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class FeedbackController {
  constructor(private readonly feedbackService: FeedbackService) {}

  @Post()
  @Permissions('feedback.create')
  create(@Body() dto: CreateFeedbackDto, @Request() req) {
    return this.feedbackService.create(dto, req.user);
  }

  @Get()
  @Permissions('feedback.view')
  findAll(@Request() req) {
    const canTriage = (req.user.permissions ?? []).includes('feedback.update');
    return this.feedbackService.findAll(req.user, canTriage);
  }

  @Patch(':id/status')
  @Permissions('feedback.update')
  updateStatus(@Param('id') id: string, @Body() dto: UpdateFeedbackStatusDto, @Request() req) {
    return this.feedbackService.updateStatus(id, dto.status, req.user.organizationId);
  }
}
