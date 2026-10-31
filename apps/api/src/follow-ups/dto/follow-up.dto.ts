import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { PaginationQueryDto } from '../../common/pagination';
import { FOLLOW_UP_OUTCOMES, FOLLOW_UP_STATUSES } from '../follow-up.constants';
import type { FollowUpStatus } from '../follow-up.constants';

const toBool = ({ value }: { value: unknown }) => value === true || value === 'true' || value === '1';

export class CreateFollowUpDto {
  @IsUUID()
  patientId: string;

  /** Defaults to the current user. */
  @IsOptional()
  @IsUUID()
  doctorId?: string;

  @IsOptional()
  @IsUUID()
  consultationId?: string;

  @IsOptional()
  @IsUUID()
  appointmentId?: string;

  @IsDateString()
  scheduledDate: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  notes?: string;
}

export class UpdateFollowUpDto {
  /** Reschedule. A MISSED follow-up that is rescheduled goes back to PENDING. */
  @IsOptional()
  @IsDateString()
  scheduledDate?: string;

  @IsOptional()
  @IsUUID()
  doctorId?: string;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(500)
  reason?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(4000)
  notes?: string | null;

  /** Link the appointment that fulfils this follow-up (status becomes SCHEDULED); null unlinks. */
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsUUID()
  appointmentId?: string | null;
}

export class UpdateFollowUpStatusDto {
  @IsIn(FOLLOW_UP_STATUSES)
  status: FollowUpStatus;
}

export class AddFollowUpOutcomeDto {
  @IsIn(FOLLOW_UP_OUTCOMES)
  outcomeType: (typeof FOLLOW_UP_OUTCOMES)[number];

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  remarks?: string;

  /** Also mark the follow-up COMPLETED. */
  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  complete?: boolean;
}

export class ListFollowUpsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsIn(FOLLOW_UP_STATUSES)
  status?: FollowUpStatus;

  @IsOptional()
  @IsUUID()
  doctorId?: string;

  @IsOptional()
  @IsUUID()
  patientId?: string;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  /** Open (PENDING/SCHEDULED) follow-ups whose date has passed. */
  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  overdue?: boolean;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  search?: string;
}

export class FollowUpMetricsQueryDto {
  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @IsUUID()
  doctorId?: string;
}
