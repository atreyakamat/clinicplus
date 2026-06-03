import { Controller, Get, Post, Body, Param, UseGuards, Request, Res } from '@nestjs/common';
import { InvoicesService } from './invoices.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PdfService } from '../common/services/pdf.service';
import { OrganizationsService } from '../organizations/organizations.service';

@Controller('api/v1/invoices')
@UseGuards(JwtAuthGuard)
export class InvoicesController {
  constructor(
    private readonly invoicesService: InvoicesService,
    private readonly pdfService: PdfService,
    private readonly organizationsService: OrganizationsService,
  ) {}

  @Post()
  create(@Body() data: any, @Request() req) {
    return this.invoicesService.create(data, req.user.organizationId, req.user.branchId, req.user.id);
  }

  @Get(':id/download')
  async download(@Param('id') id: string, @Request() req, @Res() res) {
    const invoice = await this.invoicesService.findOne(id, req.user.organizationId, req.user.branchId);
    const org = await this.organizationsService.findOne(req.user.organizationId);
    
    const buffer = await this.pdfService.generateInvoicePdf(invoice, org);
    
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="invoice-${invoice.invoiceNumber}.pdf"`,
      'Content-Length': buffer.length,
    });
    
    res.end(buffer);
  }

  @Get()
  findAll(@Request() req) {
    return this.invoicesService.findAll(req.user.organizationId, req.user.branchId);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Request() req) {
    return this.invoicesService.findOne(id, req.user.organizationId, req.user.branchId);
  }

  @Post(':id/payments')
  addPayment(@Param('id') id: string, @Body() data: any, @Request() req) {
    data.organizationId = req.user.organizationId;
    data.branchId = req.user.branchId;
    data.createdBy = req.user.id;
    return this.invoicesService.addPayment(id, data, req.user.organizationId, req.user.branchId);
  }
}
