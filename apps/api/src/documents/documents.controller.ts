import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Request,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { DocumentsService } from './documents.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { FileValidationPipe, maxUploadBytes } from '../common/pipes/file-validation.pipe';
import { DownloadQueryDto, ListDocumentsQueryDto, UpdateDocumentDto, UploadDocumentDto } from './dto/document.dto';

const meta = (req: any) => ({ ip: req.ip, userAgent: req.get?.('user-agent') });

@Controller('api/v1/documents')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  /**
   * multipart/form-data: file + patientId, documentType, title[, consultationId, reportDate].
   * The response contains only the new document (uploaders may lack documents.view).
   */
  @Post('upload')
  @Permissions('documents.upload')
  @UseInterceptors(
    FileInterceptor('file', {
      // Hard cap at the parser (+1 byte so the pipe can report the configured limit).
      limits: { fileSize: maxUploadBytes() + 1, files: 1 },
    }),
  )
  upload(
    @UploadedFile(FileValidationPipe) file: Express.Multer.File,
    @Body() dto: UploadDocumentDto,
    @Request() req,
  ) {
    return this.documentsService.upload(file, dto, req.user, meta(req));
  }

  @Get()
  @Permissions('documents.view')
  findAll(@Query() query: ListDocumentsQueryDto, @Request() req) {
    return this.documentsService.findAll(req.user, query);
  }

  /** Authenticated streaming download; every access is audit-logged. */
  @Get(':id/download')
  @Permissions('documents.view')
  async download(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() q: DownloadQueryDto,
    @Request() req,
    @Res() res: Response,
  ) {
    const disposition = q.disposition ?? 'attachment';
    const file = await this.documentsService.openForDownload(id, req.user, disposition, meta(req));
    const asciiName = file.filename.replace(/[^\x20-\x7e]/g, '_').replace(/"/g, '');
    res.set({
      'Content-Type': file.mimeType,
      'Content-Disposition': `${disposition}; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      ...(file.fileSize ? { 'Content-Length': String(file.fileSize) } : {}),
      ...(file.checksum ? { 'X-Checksum-SHA256': file.checksum } : {}),
    });
    file.stream.on('error', () => res.destroy());
    file.stream.pipe(res);
  }

  @Get(':id')
  @Permissions('documents.view')
  findOne(@Param('id', ParseUUIDPipe) id: string, @Request() req) {
    return this.documentsService.findOne(id, req.user);
  }

  @Patch(':id')
  @Permissions('documents.update')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateDocumentDto, @Request() req) {
    return this.documentsService.update(id, dto, req.user);
  }

  @Delete(':id')
  @Permissions('documents.delete')
  remove(@Param('id', ParseUUIDPipe) id: string, @Request() req) {
    return this.documentsService.remove(id, req.user);
  }
}
