import { Body, Controller, Get, Param, Post, Query, Request, UseGuards } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { CreatePaymentDto } from './dto/record-payment.dto';
import { RefundPaymentDto } from './dto/refund-payment.dto';
import { ListPaymentsQueryDto } from './dto/list-payments.dto';

const actor = (req: any) => ({
  id: req.user.id,
  organizationId: req.user.organizationId,
  branchId: req.user.branchId,
});

@Controller('api/v1/payments')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post()
  @Permissions('payments.create')
  createPayment(@Body() dto: CreatePaymentDto, @Request() req) {
    const { invoiceId, ...payment } = dto;
    return this.paymentsService.recordPayment(invoiceId, payment, actor(req));
  }

  @Get()
  @Permissions('payments.view')
  list(@Query() q: ListPaymentsQueryDto, @Request() req) {
    return this.paymentsService.listPayments(q, req.user.organizationId, req.user.branchId);
  }

  @Get('invoice/:invoiceId')
  @Permissions('payments.view')
  getPaymentsByInvoice(@Param('invoiceId') invoiceId: string, @Request() req) {
    return this.paymentsService.getPaymentsByInvoice(invoiceId, req.user.organizationId, req.user.branchId);
  }

  @Get(':id')
  @Permissions('payments.view')
  getPaymentById(@Param('id') id: string, @Request() req) {
    return this.paymentsService.findPaymentById(id, req.user.organizationId, req.user.branchId);
  }

  @Post(':id/refund')
  @Permissions('payments.refund')
  refundPayment(@Param('id') paymentId: string, @Body() dto: RefundPaymentDto, @Request() req) {
    return this.paymentsService.refundPayment(paymentId, dto, actor(req));
  }
}
