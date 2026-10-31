import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

const YMD = /^\d{4}-\d{2}-\d{2}$/;

export class AnalyticsQueryDto {
  @IsOptional()
  @Matches(YMD, { message: 'from must be YYYY-MM-DD' })
  from?: string;

  @IsOptional()
  @Matches(YMD, { message: 'to must be YYYY-MM-DD' })
  to?: string;

  /** IANA timezone; defaults to the branch timezone. */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  tz?: string;

  /** `org` = all branches (org-wide roles only). */
  @IsOptional()
  @IsIn(['branch', 'org'])
  scope?: 'branch' | 'org';

  @IsOptional()
  @IsIn(['day', 'week', 'month'])
  interval?: 'day' | 'week' | 'month';
}

export class TodayQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  tz?: string;

  /** Only the caller's own appointments (doctor view). */
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true' || value === '1')
  @IsBoolean()
  mine?: boolean;
}
