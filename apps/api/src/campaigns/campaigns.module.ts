import { Module } from '@nestjs/common';
import { MessagesModule } from '../messages/messages.module';
import { CampaignsController, TemplatesController } from './campaigns.controller';
import { CampaignsService } from './campaigns.service';
import { TemplatesService } from './templates.service';

@Module({
  imports: [MessagesModule],
  controllers: [TemplatesController, CampaignsController],
  providers: [TemplatesService, CampaignsService],
  exports: [TemplatesService, CampaignsService],
})
export class CampaignsModule {}
