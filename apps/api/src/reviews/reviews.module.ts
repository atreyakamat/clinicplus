import { Module } from '@nestjs/common';
import { MessagesModule } from '../messages/messages.module';
import { ReviewsController } from './reviews.controller';
import { PublicReviewsController } from './public-reviews.controller';
import { ReferralsController } from './referrals.controller';
import { ReviewsService } from './reviews.service';
import { ReferralsService } from './referrals.service';
import { ReviewRequestSchedulerService } from './review-request-scheduler.service';

/**
 * Reviews, NPS, referrals and reputation. Review links are delivered through
 * SmsService.sendAndRecord, which is registered by MessagesModule (imported so
 * it is instantiated before this module; resolved via ModuleRef because
 * MessagesModule does not export it).
 */
@Module({
  imports: [MessagesModule],
  controllers: [ReviewsController, PublicReviewsController, ReferralsController],
  providers: [ReviewsService, ReferralsService, ReviewRequestSchedulerService],
  exports: [ReviewsService, ReviewRequestSchedulerService],
})
export class ReviewsModule {}
