import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { PaginationQueryDto } from '../../common/pagination';

const toBool = ({ value }: { value: unknown }) =>
  value === undefined ? undefined : value === true || value === 'true' || value === '1';
const toInt = ({ value }: { value: unknown }) =>
  value === undefined || value === '' ? undefined : Number(value);
const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export const REVIEW_REQUEST_STATUS = {
  PENDING: 'PENDING',
  SENT: 'SENT',
  FAILED: 'FAILED',
  COMPLETED: 'COMPLETED',
} as const;

export const REFERRAL_STATUSES = ['NEW', 'CONTACTED', 'CONVERTED', 'LOST'] as const;
export type ReferralStatus = (typeof REFERRAL_STATUSES)[number];

export class CreateReviewRequestDto {
  @IsUUID()
  patientId: string;

  /** The visit being reviewed; its doctor is used when doctorId is omitted. */
  @IsOptional()
  @IsUUID()
  appointmentId?: string;

  @IsOptional()
  @IsUUID()
  doctorId?: string;
}

export class SubmitReviewDto {
  @Transform(toInt)
  @IsInt()
  @Min(1)
  @Max(5)
  rating: number;

  @IsOptional()
  @Transform(toInt)
  @IsInt()
  @Min(0)
  @Max(10)
  npsScore?: number;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(2000)
  comment?: string;
}

export class ListReviewsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @Transform(toInt)
  @IsInt()
  @Min(1)
  @Max(5)
  rating?: number;

  @IsOptional()
  @Transform(toInt)
  @IsInt()
  @Min(1)
  @Max(5)
  maxRating?: number;

  @IsOptional()
  @IsUUID()
  doctorId?: string;

  @IsOptional()
  @IsUUID()
  patientId?: string;

  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  isPublic?: boolean;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}

export class ReviewSummaryQueryDto {
  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}

export class ListReviewRequestsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsIn(Object.values(REVIEW_REQUEST_STATUS))
  status?: string;

  @IsOptional()
  @IsUUID()
  patientId?: string;
}

export class SetReviewPublicDto {
  @IsBoolean()
  isPublic: boolean;
}

export class ReviewTokenParam {
  @Matches(/^[A-Za-z0-9_-]{16,128}$/)
  token: string;
}

export class CreateReferralDto {
  /** The existing patient who made the referral. */
  @IsUUID()
  patientId: string;

  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  referredName: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @Matches(/^[+0-9 ()-]{6,20}$/, { message: 'referredPhone must be a valid phone number' })
  referredPhone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  source?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  campaignName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class UpdateReferralDto {
  @IsOptional()
  @IsIn(REFERRAL_STATUSES)
  status?: ReferralStatus;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  referredName?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @Matches(/^[+0-9 ()-]{6,20}$/, { message: 'referredPhone must be a valid phone number' })
  referredPhone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  source?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class ConvertReferralDto {
  /** The patient record created for the referred person. */
  @IsUUID()
  convertedPatientId: string;
}

export class ListReferralsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsIn(REFERRAL_STATUSES)
  status?: ReferralStatus;

  @IsOptional()
  @IsUUID()
  patientId?: string;
}
