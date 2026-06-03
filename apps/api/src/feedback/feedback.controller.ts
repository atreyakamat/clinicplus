import { Controller, Get, Post, Body, Patch, Param, UseGuards, Request } from '@nestjs/common';
import { FeedbackService } from './feedback.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('api/v1/feedback')
@UseGuards(JwtAuthGuard)
export class FeedbackController {
  constructor(private readonly feedbackService: FeedbackService) {}

  @Post()
  create(@Body() data: any, @Request() req) {
    data.organizationId = req.user.organizationId;
    data.userId = req.user.id;
    return this.feedbackService.create(data);
  }

  @Get()
  findAll(@Request() req) {
    return this.feedbackService.findAll(req.user.organizationId);
  }

  @Patch(':id/status')
  updateStatus(@Param('id') id: string, @Body('status') status: string, @Request() req) {
    return this.feedbackService.updateStatus(id, status, req.user.organizationId);
  }
}
