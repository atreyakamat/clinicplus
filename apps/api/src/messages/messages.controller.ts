import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, Request, UseGuards } from '@nestjs/common';
import { MessagesService, Scope } from './messages.service';
import { MessagingService } from './messaging.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { ConversationQueryDto, MessageLogQueryDto, ReplyDto, SendLegacyMessageDto, SendMessageDto } from './dto/messages.dto';

const scope = (req: any): Scope => ({
  organizationId: req.user.organizationId,
  branchId: req.user.branchId,
  orgWide: !!req.user.orgWide,
});

@Controller('api/v1/messages')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class MessagesController {
  constructor(
    private readonly messagesService: MessagesService,
    private readonly messaging: MessagingService,
  ) {}

  /** Delivery log (paginated) for the active branch. */
  @Get()
  @Permissions('messages.view')
  findAll(@Request() req, @Query() q: MessageLogQueryDto) {
    return this.messagesService.findAll(scope(req), q);
  }

  @Get('stats')
  @Permissions('messages.view')
  stats(@Request() req) {
    return this.messagesService.stats(scope(req));
  }

  /** Which driver is active and which channels can deliver. No secrets. */
  @Get('provider-status')
  @Permissions('messages.view')
  providerStatus() {
    return this.messaging.providerStatus();
  }

  @Get('conversations')
  @Permissions('messages.view')
  conversations(@Request() req, @Query() q: ConversationQueryDto) {
    return this.messagesService.conversations(scope(req), q);
  }

  @Get('conversations/:patientId')
  @Permissions('messages.view')
  thread(@Request() req, @Param('patientId', ParseUUIDPipe) patientId: string) {
    return this.messagesService.thread(scope(req), patientId);
  }

  @Post('conversations/:patientId/reply')
  @Permissions('messages.send')
  reply(@Request() req, @Param('patientId', ParseUUIDPipe) patientId: string, @Body() dto: ReplyDto) {
    return this.messagesService.reply(scope(req), patientId, dto.body, dto.channel);
  }

  /** Compose: free text or a template, channel optional (patient preference / default). */
  @Post('send')
  @Permissions('messages.send')
  send(@Request() req, @Body() dto: SendMessageDto) {
    return this.messagesService.send(scope(req), dto);
  }

  @Post('whatsapp')
  @Permissions('messages.send')
  sendWhatsApp(@Body() data: SendLegacyMessageDto, @Request() req) {
    return this.messagesService.send(scope(req), { patientId: data.patientId, body: data.content, channel: 'WHATSAPP' });
  }

  @Post('sms')
  @Permissions('messages.send')
  sendSms(@Body() data: SendLegacyMessageDto, @Request() req) {
    return this.messagesService.send(scope(req), { patientId: data.patientId, body: data.content, channel: 'SMS' });
  }

  @Get('templates')
  @Permissions('messages.view')
  getTemplates(@Request() req) {
    return this.messagesService.listTemplates(req.user.organizationId);
  }
}
