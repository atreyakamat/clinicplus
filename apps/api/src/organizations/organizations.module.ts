import { Module } from '@nestjs/common';
import { OrganizationsController } from './organizations.controller';
import { OrganizationsService } from './organizations.service';
import { PlatformController } from './platform.controller';
import { PlatformService } from './platform.service';

@Module({
  controllers: [OrganizationsController, PlatformController],
  providers: [OrganizationsService, PlatformService],
  exports: [OrganizationsService],
})
export class OrganizationsModule {}
