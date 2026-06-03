import { Controller, Get, Post, Body, Param, Patch, Delete, UseGuards, Request, UseInterceptors, UploadedFile } from '@nestjs/common';
import { DocumentsService } from './documents.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { FileInterceptor } from '@nestjs/platform-express';
import { FileValidationPipe } from '../common/pipes/file-validation.pipe';

@Controller('api/v1/documents')
@UseGuards(JwtAuthGuard)
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  async uploadFile(
    @UploadedFile(FileValidationPipe) file: Express.Multer.File,
    @Body() body: { patientId: string; documentType: string; title: string },
    @Request() req
  ) {
    // In a real implementation, upload to Cloudflare R2 / S3
    // For now, simulate storage and record in DB
    const fileUrl = `https://storage.clinicos.com/${req.user.organizationId}/${file.originalname}`;
    
    return this.documentsService.create({
      patientId: body.patientId,
      organizationId: req.user.organizationId,
      branchId: req.user.branchId,
      uploadedBy: req.user.id,
      title: body.title,
      documentType: body.documentType,
      fileUrl,
      mimeType: file.mimetype,
      fileSize: file.size,
    } as any, req.user.organizationId, req.user.branchId, req.user.id);
  }

  @Post()
  create(@Body() data: any, @Request() req) {
    return this.documentsService.create(data, req.user.organizationId, req.user.branchId, req.user.id);
  }

  @Get()
  findAll(@Request() req) {
    return this.documentsService.findAll(req.user.organizationId, req.user.branchId);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Request() req) {
    return this.documentsService.findOne(id, req.user.organizationId, req.user.branchId);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() data: any, @Request() req) {
    return this.documentsService.update(id, data, req.user.organizationId, req.user.branchId);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Request() req) {
    return this.documentsService.remove(id, req.user.organizationId, req.user.branchId);
  }
}
