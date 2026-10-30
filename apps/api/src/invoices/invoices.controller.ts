import { Body, Controller, Get, Param, Patch, Post, Query, Request, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { InvoicesService } from './invoices.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { PdfService } from '../common/services/pdf.service';
import { PrismaService } from '../prisma/prisma.service';
import { PaymentsService } from '../payments/payments.service';
import { StripeService } from '../payments/stripe.service';
import { RecordPaymentDto } from '../payments/dto/record-payment.dto';
import { PaymentLinkDto } from '../payments/dto/payment-link.dto';
import { CreateInvoiceDto, ListInvoicesQueryDto, UpdateInvoiceDto, VoidInvoiceDto } from './dto/invoice.dto';

const actor = (req: any) => ({
  id: req.user.id,
  organizationId: req.user.organizationId,
  branchId: req.user.branchId,
});

@Controller('api/v1/invoices')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class InvoicesController {
  constructor(
    private readonly invoicesService: InvoicesService,
    private readonly paymentsService: PaymentsService,
    private readonly stripe: StripeService,
    private readonly pdfService: PdfService,
    private readonly prisma: PrismaService,
  ) {}

  @Post()
  @Permissions('invoices.create')
  create(@Body() dto: CreateInvoiceDto, @Request() req) {
    return this.invoicesService.create(dto, actor(req));
  }

  @Get()
  @Permissions('invoices.view')
  findAll(@Query() q: ListInvoicesQueryDto, @Request() req) {
    return this.invoicesService.findAll(q, req.user.organizationId, req.user.branchId);
  }

  /** Service/price catalog for the invoice form. */
  @Get('catalog')
  @Permissions('invoices.create')
  catalog(@Request() req) {
    return this.invoicesService.catalog(req.user.organizationId);
  }

  /** Billing configuration the UI needs (currency, whether online payments are on). */
  @Get('config')
  @Permissions('invoices.view')
  async config(@Request() req) {
    const org = await this.prisma.organization.findUnique({
      where: { id: req.user.organizationId },
      select: { currency: true },
    });
    return { currency: (org?.currency || 'INR').toUpperCase(), onlinePayments: this.stripe.isEnabled() };
  }

  @Get(':id/download')
  @Permissions('invoices.view')
  async download(@Param('id') id: string, @Request() req, @Res() res: Response) {
    const invoice = await this.invoicesService.findOne(id, req.user.organizationId, req.user.branchId);
    const org = await this.prisma.organization.findUnique({ where: { id: req.user.organizationId } });
    const buffer = await this.pdfService.generateInvoicePdf(invoice, org, {
      currency: (org?.currency || 'INR').toUpperCase(),
    });
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="invoice-${invoice.invoiceNumber}.pdf"`,
      'Content-Length': buffer.length,
    });
    res.end(buffer);
  }

  @Get(':id')
  @Permissions('invoices.view')
  findOne(@Param('id') id: string, @Request() req) {
    return this.invoicesService.findOne(id, req.user.organizationId, req.user.branchId);
  }

  @Patch(':id')
  @Permissions('invoices.update')
  update(@Param('id') id: string, @Body() dto: UpdateInvoiceDto, @Request() req) {
    return this.invoicesService.update(id, dto, actor(req));
  }

  @Post(':id/send')
  @Permissions('invoices.update')
  send(@Param('id') id: string, @Request() req) {
    return this.invoicesService.markSent(id, actor(req));
  }

  @Post(':id/void')
  @Permissions('invoices.update')
  void(@Param('id') id: string, @Body() dto: VoidInvoiceDto, @Request() req) {
    return this.invoicesService.void(id, dto, actor(req));
  }

  @Post(':id/payments')
  @Permissions('payments.create')
  addPayment(@Param('id') id: string, @Body() dto: RecordPaymentDto, @Request() req) {
    return this.paymentsService.recordPayment(id, dto, actor(req));
  }

  @Post(':id/payment-link')
  @Permissions('payments.create')
  paymentLink(@Param('id') id: string, @Body() dto: PaymentLinkDto, @Request() req) {
    return this.paymentsService.createPaymentLink(id, actor(req), { send: dto?.send });
  }
}
