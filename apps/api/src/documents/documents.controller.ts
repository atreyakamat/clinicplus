import { Controller, Get, Post, Body, Param, Patch, Delete, UseGuards, Request, Res } from '@nestjs/common';
import { DocumentsService } from './documents.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('api/v1/documents')
@UseGuards(JwtAuthGuard)
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

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
