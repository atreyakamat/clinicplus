import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Patch,
  Delete,
  UseGuards,
  Request,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { DocumentsService } from './documents.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { FileInterceptor } from '@nestjs/platform-express';
import { FileValidationPipe } from '../common/pipes/file-validation.pipe';
import { MalwareScannerService } from '../security/malware-scanner.service';

@Controller('api/v1/documents')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class DocumentsController {
  constructor(
    private readonly documentsService: DocumentsService,
    private readonly malwareScannerService: MalwareScannerService,
  ) {}

  @Post('upload')
  @Permissions('documents:create')
  @UseInterceptors(FileInterceptor('file'))
  async uploadFile(
    @UploadedFile(FileValidationPipe) file: Express.Multer.File,
    @Body() body: { patientId: string; documentType: string; title: string },
    @Request() req,
  ) {
    // Malware scanning hook
    await this.malwareScannerService.scanAndValidate(file);

    // In a real implementation, upload to Cloudflare R2 / S3
    // For now, simulate storage and record in DB
    const fileUrl = `https://storage.clinicos.com/${req.user.organizationId}/${file.originalname}`;

    return this.documentsService.create(
      {
        patientId: body.patientId,
        organizationId: req.user.organizationId,
        branchId: req.user.branchId,
        uploadedBy: req.user.id,
        title: body.title,
        documentType: body.documentType,
        fileUrl,
        mimeType: file.mimetype,
        fileSize: file.size,
      },
      req.user.organizationId,
      req.user.branchId,
      req.user.id,
    );
  }

  @Post()
  @Permissions('documents:create')
  create(@Body() data: any, @Request() req) {
    return this.documentsService.create(
      data,
      req.user.organizationId,
      req.user.branchId,
      req.user.id,
    );
  }

  @Get()
  @Permissions('documents:read')
  findAll(@Request() req) {
    return this.documentsService.findAll(
      req.user.organizationId,
      req.user.branchId,
    );
  }

  @Get(':id')
  @Permissions('documents:read')
  findOne(@Param('id') id: string, @Request() req) {
    return this.documentsService.findOne(
      id,
      req.user.organizationId,
      req.user.branchId,
    );
  }

  @Patch(':id')
  @Permissions('documents:update')
  update(@Param('id') id: string, @Body() data: any, @Request() req) {
    return this.documentsService.update(
      id,
      data,
      req.user.organizationId,
      req.user.branchId,
    );
  }

  @Delete(':id')
  @Permissions('documents:delete')
  remove(@Param('id') id: string, @Request() req) {
    return this.documentsService.remove(
      id,
      req.user.organizationId,
      req.user.branchId,
    );
  }
}