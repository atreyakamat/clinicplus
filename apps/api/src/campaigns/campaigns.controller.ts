import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { CampaignActor, CampaignsService } from './campaigns.service';
import { TemplatesService } from './templates.service';
import { AudiencePreviewDto, CampaignListQueryDto, CreateCampaignDto, SendCampaignDto, UpdateCampaignDto } from './dto/campaigns.dto';
import { CreateTemplateDto, PreviewTemplateDto, UpdateTemplateDto } from './dto/templates.dto';

const actor = (req: any): CampaignActor => ({
  organizationId: req.user.organizationId,
  branchId: req.user.branchId,
  userId: req.user.id,
  orgWide: !!req.user.orgWide,
});

@Controller('api/v1/templates')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class TemplatesController {
  constructor(private readonly templates: TemplatesService) {}

  @Get()
  @Permissions('messages.view')
  list(@Request() req) {
    return this.templates.list(req.user.organizationId);
  }

  @Post('preview')
  @Permissions('messages.view')
  preview(@Request() req, @Body() dto: PreviewTemplateDto) {
    return this.templates.preview(actor(req), dto);
  }

  @Get(':id')
  @Permissions('messages.view')
  findOne(@Request() req, @Param('id', ParseUUIDPipe) id: string) {
    return this.templates.findOne(req.user.organizationId, id);
  }

  @Post()
  @Permissions('templates.manage')
  create(@Request() req, @Body() dto: CreateTemplateDto) {
    return this.templates.create(actor(req), dto);
  }

  @Patch(':id')
  @Permissions('templates.manage')
  update(@Request() req, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateTemplateDto) {
    return this.templates.update(actor(req), id, dto);
  }

  @Delete(':id')
  @Permissions('templates.manage')
  remove(@Request() req, @Param('id', ParseUUIDPipe) id: string) {
    return this.templates.remove(actor(req), id);
  }
}

@Controller('api/v1/campaigns')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class CampaignsController {
  constructor(private readonly campaigns: CampaignsService) {}

  @Get()
  @Permissions('campaigns.view')
  list(@Request() req, @Query() q: CampaignListQueryDto) {
    return this.campaigns.list(actor(req), q);
  }

  @Post('audience/preview')
  @Permissions('campaigns.view')
  previewAudience(@Request() req, @Body() dto: AudiencePreviewDto) {
    return this.campaigns.previewAudience(actor(req), dto.audience, dto.allBranches);
  }

  @Get(':id')
  @Permissions('campaigns.view')
  findOne(@Request() req, @Param('id', ParseUUIDPipe) id: string) {
    return this.campaigns.findOne(actor(req), id);
  }

  @Post()
  @Permissions('campaigns.manage')
  create(@Request() req, @Body() dto: CreateCampaignDto) {
    return this.campaigns.create(actor(req), dto);
  }

  @Patch(':id')
  @Permissions('campaigns.manage')
  update(@Request() req, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCampaignDto) {
    return this.campaigns.update(actor(req), id, dto);
  }

  @Delete(':id')
  @Permissions('campaigns.manage')
  remove(@Request() req, @Param('id', ParseUUIDPipe) id: string) {
    return this.campaigns.remove(actor(req), id);
  }

  @Post(':id/send')
  @Permissions('campaigns.manage')
  send(@Request() req, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SendCampaignDto) {
    return this.campaigns.send(actor(req), id, dto);
  }

  @Post(':id/cancel')
  @Permissions('campaigns.manage')
  cancel(@Request() req, @Param('id', ParseUUIDPipe) id: string) {
    return this.campaigns.cancel(actor(req), id);
  }
}
