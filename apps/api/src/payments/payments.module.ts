import { Module } from '@nestjs/common';
import { PaymentsController } from './payments.controller';
import { PublicPaymentsController } from './public-payments.controller';
import { PaymentsService } from './payments.service';
import { LedgerService } from './ledger.service';
import { StripeService } from './stripe.service';

@Module({
  controllers: [PaymentsController, PublicPaymentsController],
  providers: [PaymentsService, LedgerService, StripeService],
  exports: [PaymentsService, LedgerService, StripeService],
})
export class PaymentsModule {}
