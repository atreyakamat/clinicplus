import { Module } from '@nestjs/common';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';
import { SecurityModule } from '../security/security.module';

@Module({
  controllers: [DocumentsController],
  providers: [DocumentsService],
  imports: [SecurityModule],
})
export class DocumentsModule {}