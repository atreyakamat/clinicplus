import {
  Body,
  Controller,
  Delete,
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
import { ReferralsService } from './referrals.service';
import {
  ConvertReferralDto,
  CreateReferralDto,
  ListReferralsQueryDto,
  UpdateReferralDto,
} from './dto/review.dto';

@Controller('api/v1/referrals')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class ReferralsController {
  constructor(private readonly referrals: ReferralsService) {}

  @Get()
  @Permissions('reviews.view')
  findAll(@Query() query: ListReferralsQueryDto, @Request() req) {
    return this.referrals.findAll(query, req.user);
  }

  @Get('stats')
  @Permissions('reviews.view')
  stats(@Request() req) {
    return this.referrals.stats(req.user);
  }

  @Get(':id')
  @Permissions('reviews.view')
  findOne(@Param('id') id: string, @Request() req) {
    return this.referrals.findOne(id, req.user);
  }

  @Post()
  @Permissions('reviews.manage')
  create(@Body() dto: CreateReferralDto, @Request() req) {
    return this.referrals.create(dto, req.user);
  }

  @Patch(':id')
  @Permissions('reviews.manage')
  update(@Param('id') id: string, @Body() dto: UpdateReferralDto, @Request() req) {
    return this.referrals.update(id, dto, req.user);
  }

  @Post(':id/convert')
  @Permissions('reviews.manage')
  convert(@Param('id') id: string, @Body() dto: ConvertReferralDto, @Request() req) {
    return this.referrals.convert(id, dto, req.user);
  }

  @Delete(':id')
  @Permissions('reviews.manage')
  remove(@Param('id') id: string, @Request() req) {
    return this.referrals.remove(id, req.user);
  }
}
