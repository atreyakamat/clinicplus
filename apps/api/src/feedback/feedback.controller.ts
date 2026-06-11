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

@Controller('api/v1/feedback')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class FeedbackController {
  constructor(private readonly feedbackService: FeedbackService) {}

  @Post()
  @Permissions('feedback:create')
  create(@Body() data: any, @Request() req) {
    data.organizationId = req.user.organizationId;
    data.userId = req.user.id;
    return this.feedbackService.create(data);
  }

  @Get()
  @Permissions('feedback:read')
  findAll(@Request() req) {
    return this.feedbackService.findAll(req.user.organizationId);
  }

  @Patch(':id/status')
  @Permissions('feedback:update')
  updateStatus(
    @Param('id') id: string,
    @Body('status') status: string,
    @Request() req,
  ) {
    return this.feedbackService.updateStatus(
      id,
      status,
      req.user.organizationId,
    );
  }
}
