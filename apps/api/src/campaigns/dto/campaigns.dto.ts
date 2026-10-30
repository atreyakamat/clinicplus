import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { PaginationQueryDto } from '../../common/pagination';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/**
 * Audience filter (stored as Campaign.audience JSON). All conditions are AND-ed.
 * Patients who opted out (replied STOP), have no phone, or are archived are always excluded.
 */
export class AudienceFilterDto {
  /** Patient has ANY of these tags. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(60, { each: true })
  tags?: string[];

  @IsOptional()
  @IsIn(['MALE', 'FEMALE', 'OTHER'])
  gender?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(130)
  ageMin?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(130)
  ageMax?: number;

  /** Last completed visit was MORE than N days ago (lapsed patients). */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(3650)
  lastVisitBeforeDays?: number;

  /** Had a completed visit WITHIN the last N days. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(3650)
  lastVisitAfterDays?: number;

  /** true: has a future scheduled appointment; false: has none. */
  @IsOptional()
  @IsBoolean()
  hasUpcomingAppointment?: boolean;

  /** Org-wide campaigns only: restrict to one branch. */
  @IsOptional()
  @IsUUID()
  branchId?: string;
}

export class CreateCampaignDto {
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(150)
  name!: string;

  @IsIn(['SMS', 'WHATSAPP'])
  channel!: 'SMS' | 'WHATSAPP';

  @IsOptional()
  @IsUUID()
  templateId?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(1600)
  messageBody?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => AudienceFilterDto)
  audience?: AudienceFilterDto;

  /** Org-wide users only: target every branch (otherwise the active branch). */
  @IsOptional()
  @IsBoolean()
  allBranches?: boolean;
}

export class UpdateCampaignDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(150)
  name?: string;

  @IsOptional()
  @IsIn(['SMS', 'WHATSAPP'])
  channel?: 'SMS' | 'WHATSAPP';

  @IsOptional()
  @IsUUID()
  templateId?: string | null;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(1600)
  messageBody?: string | null;

  @IsOptional()
  @ValidateNested()
  @Type(() => AudienceFilterDto)
  audience?: AudienceFilterDto;
}

export class AudiencePreviewDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => AudienceFilterDto)
  audience?: AudienceFilterDto;

  @IsOptional()
  @IsBoolean()
  allBranches?: boolean;
}

export class SendCampaignDto {
  /** Future time → scheduled; omitted/past → send now. */
  @IsOptional()
  @IsDateString()
  scheduledAt?: string;
}

export class CampaignListQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsIn(['DRAFT', 'SCHEDULED', 'SENDING', 'COMPLETED', 'CANCELLED'])
  status?: string;
}
