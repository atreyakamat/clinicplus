import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  UseGuards,
  Request,
  Query,
} from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { RefundPaymentDto } from './dto/refund-payment.dto';

@Controller('api/v1/payments')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post()
  @Roles(
    'super-admin',
    'organization-owner',
    'clinic-admin',
    'receptionist',
    'accountant',
  )
  @Permissions('payments:create')
  async createPayment(
    @Body() createPaymentDto: CreatePaymentDto,
    @Request() req,
  ) {
    return this.paymentsService.createPayment(
      createPaymentDto,
      req.user.organizationId,
      req.user.branchId,
      req.user.id,
    );
  }

  @Get(':id')
  @Roles(
    'super-admin',
    'organization-owner',
    'clinic-admin',
    'receptionist',
    'accountant',
  )
  @Permissions('payments:view')
  async getPaymentById(@Param('id') id: string, @Request() req) {
    return this.paymentsService.findPaymentById(
      id,
      req.user.organizationId,
      req.user.branchId,
    );
  }

  @Post(':id/refund')
  @Roles(
    'super-admin',
    'organization-owner',
    'clinic-admin',
    'receptionist',
    'accountant',
  )
  @Permissions('payments:refund')
  async refundPayment(
    @Param('id') paymentId: string,
    @Body() refundPaymentDto: RefundPaymentDto,
    @Request() req,
  ) {
    return this.paymentsService.refundPayment(
      paymentId,
      refundPaymentDto,
      req.user.organizationId,
      req.user.branchId,
      req.user.id,
    );
  }

  @Get('invoice/:invoiceId')
  @Roles(
    'super-admin',
    'organization-owner',
    'clinic-admin',
    'receptionist',
    'accountant',
  )
  @Permissions('payments:view')
  async getPaymentsByInvoice(
    @Param('invoiceId') invoiceId: string,
    @Request() req,
  ) {
    return this.paymentsService.getPaymentsByInvoice(
      invoiceId,
      req.user.organizationId,
      req.user.branchId,
    );
  }

  @Get()
  @Roles('super-admin', 'organization-owner', 'clinic-admin', 'accountant')
  @Permissions('payments:view')
  async getPayments(
    @Request() req,
    @Query('skip') skip: number = 0,
    @Query('take') take: number = 10,
  ) {
    return this.paymentsService.getPayments(
      req.user.organizationId,
      req.user.branchId,
      skip,
      take,
    );
  }

  @Get('count')
  @Roles('super-admin', 'organization-owner', 'clinic-admin', 'accountant')
  @Permissions('payments:view')
  async countPayments(@Request() req) {
    return this.paymentsService.countPayments(
      req.user.organizationId,
      req.user.branchId,
    );
  }
}
