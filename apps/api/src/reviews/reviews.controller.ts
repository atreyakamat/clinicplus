import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { ReviewsService } from './reviews.service';
import {
  CreateReviewRequestDto,
  ListReviewRequestsQueryDto,
  ListReviewsQueryDto,
  ReviewSummaryQueryDto,
  SetReviewPublicDto,
} from './dto/review.dto';

@Controller('api/v1/reviews')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class ReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  @Get()
  @Permissions('reviews.view')
  findAll(@Query() query: ListReviewsQueryDto, @Request() req) {
    return this.reviews.findAll(query, req.user);
  }

  @Get('summary')
  @Permissions('reviews.view')
  summary(@Query() query: ReviewSummaryQueryDto, @Request() req) {
    return this.reviews.summary(query, req.user);
  }

  @Get('requests')
  @Permissions('reviews.view')
  listRequests(@Query() query: ListReviewRequestsQueryDto, @Request() req) {
    return this.reviews.listRequests(query, req.user);
  }

  @Post('requests')
  @Permissions('reviews.manage')
  createRequest(@Body() dto: CreateReviewRequestDto, @Request() req) {
    return this.reviews.createRequest(dto, req.user);
  }

  @Get(':id')
  @Permissions('reviews.view')
  findOne(@Param('id') id: string, @Request() req) {
    return this.reviews.findOne(id, req.user);
  }

  @Patch(':id/public')
  @Permissions('reviews.manage')
  setPublic(@Param('id') id: string, @Body() dto: SetReviewPublicDto, @Request() req) {
    return this.reviews.setPublic(id, dto.isPublic, req.user);
  }
}
