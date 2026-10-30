import { Controller, Get, Headers, HttpCode, Post, Query, Req } from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { PaymentsService } from './payments.service';

/**
 * Unauthenticated endpoints. The webhook is authenticated by its Stripe signature;
 * the status endpoint returns no personal data (status, amount paid, clinic name).
 */
@Controller('api/v1')
export class PublicPaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post('webhooks/stripe')
  @HttpCode(200)
  stripeWebhook(@Req() req: RawBodyRequest<Request>, @Headers('stripe-signature') signature?: string) {
    return this.paymentsService.handleStripeWebhook(req.rawBody, signature);
  }

  // Tighter than the global limit: this endpoint takes an invoice UUID and is
  // unauthenticated, so cap probing to 20 req/min per client.
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  @Get('public/payments/status')
  status(@Query('invoice') invoice?: string) {
    return this.paymentsService.publicStatus(invoice);
  }
}
