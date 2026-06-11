import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  Request,
} from '@nestjs/common';
import { MessagesService } from './messages.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Permissions } from '../auth/decorators/permissions.decorator';

@Controller('api/v1/messages')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class MessagesController {
  constructor(private readonly messagesService: MessagesService) {}

  @Get()
  @Permissions('messages:read')
  findAll(@Request() req) {
    return this.messagesService.findAll(
      req.user.organizationId,
      req.user.branchId,
    );
  }

  @Post('whatsapp')
  @Permissions('messages:create')
  sendWhatsApp(
    @Body() data: { patientId: string; content: string },
    @Request() req,
  ) {
    return this.messagesService.sendWhatsApp(
      data.patientId,
      data.content,
      req.user.organizationId,
      req.user.branchId,
    );
  }

  @Get('templates')
  @Permissions('messages:read')
  getTemplates(@Request() req) {
    return this.messagesService.getTemplates(req.user.organizationId);
  }
}
