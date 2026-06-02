import { Controller, Get, Post, Body, UseGuards, Request } from '@nestjs/common';
import { MessagesService } from './messages.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('api/v1/messages')
@UseGuards(JwtAuthGuard)
export class MessagesController {
  constructor(private readonly messagesService: MessagesService) {}

  @Get()
  findAll(@Request() req) {
    return this.messagesService.findAll(req.user.organizationId, req.user.branchId);
  }

  @Post('whatsapp')
  sendWhatsApp(@Body() data: { patientId: string, content: string }, @Request() req) {
    return this.messagesService.sendWhatsApp(data.patientId, data.content, req.user.organizationId, req.user.branchId);
  }

  @Get('templates')
  getTemplates(@Request() req) {
    return this.messagesService.getTemplates(req.user.organizationId);
  }
}
