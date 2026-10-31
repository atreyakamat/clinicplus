import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ReviewsService } from './reviews.service';
import { SubmitReviewDto } from './dto/review.dto';

/**
 * Public (no login) review form backend. Access is granted solely by the
 * one-time, 14-day review token; responses carry no patient PII beyond first name.
 */
@Controller('api/v1/public/reviews')
@Throttle({ default: { limit: 20, ttl: 60_000 } })
export class PublicReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  @Get(':token')
  info(@Param('token') token: string) {
    return this.reviews.publicInfo(token);
  }

  @Post(':token')
  @HttpCode(201)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  submit(@Param('token') token: string, @Body() dto: SubmitReviewDto) {
    return this.reviews.publicSubmit(token, dto);
  }
}
