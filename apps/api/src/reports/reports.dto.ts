import { IsIn, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../common/pagination';

const YMD = /^\d{4}-\d{2}-\d{2}$/;

export class ReportQueryDto extends PaginationQueryDto {
  /** `org` = consolidated across all branches (org-wide roles only). */
  @IsOptional()
  @IsIn(['branch', 'org'])
  scope?: 'branch' | 'org';

  @IsOptional()
  @IsString()
  @MaxLength(64)
  tz?: string;

  @IsOptional()
  @Matches(YMD, { message: 'from must be YYYY-MM-DD' })
  from?: string;

  @IsOptional()
  @Matches(YMD, { message: 'to must be YYYY-MM-DD' })
  to?: string;

  /** Daily close date (defaults to today in the branch timezone). */
  @IsOptional()
  @Matches(YMD, { message: 'date must be YYYY-MM-DD' })
  date?: string;

  @IsOptional()
  @IsIn(['doctor', 'service', 'method'])
  groupBy?: 'doctor' | 'service' | 'method';
}

export const REPORT_NAMES = ['outstanding', 'ageing', 'daily-close', 'revenue'] as const;
export type ReportName = (typeof REPORT_NAMES)[number];
