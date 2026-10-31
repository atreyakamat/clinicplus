import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { PaginationQueryDto } from '../../common/pagination';

export const APPOINTMENT_STATUSES = [
  'SCHEDULED',
  'CONFIRMED',
  'CHECKED_IN',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED',
  'NO_SHOW',
] as const;
export type AppointmentStatusValue = (typeof APPOINTMENT_STATUSES)[number];

export class CreateAppointmentDto {
  @IsUUID()
  patientId: string;

  @IsUUID()
  doctorId: string;

  @IsDateString()
  scheduledStart: string;

  @IsDateString()
  scheduledEnd: string;

  @IsOptional() @IsString() @MaxLength(100)
  appointmentType?: string;

  @IsOptional() @IsString() @MaxLength(50)
  appointmentSource?: string;

  @IsOptional() @IsString() @MaxLength(2000)
  notes?: string;

  /**
   * Book even when the slot is outside working hours / doctor availability or
   * on leave / holiday. Requires `appointments.update`. Never bypasses the
   * double-booking check.
   */
  @IsOptional() @IsBoolean()
  force?: boolean;
}

export class UpdateAppointmentDto {
  @IsOptional() @IsString() @MaxLength(100)
  appointmentType?: string;

  @IsOptional() @IsString() @MaxLength(50)
  appointmentSource?: string;

  @IsOptional() @IsString() @MaxLength(2000)
  notes?: string;

  /** Legacy: status changes go through the same state machine as the action endpoints. */
  @IsOptional() @IsIn(APPOINTMENT_STATUSES)
  status?: AppointmentStatusValue;

  @IsOptional() @IsString() @MaxLength(500)
  cancellationReason?: string;
}

export class RescheduleAppointmentDto {
  @IsDateString()
  scheduledStart: string;

  @IsDateString()
  scheduledEnd: string;

  /** Optionally move to another doctor. */
  @IsOptional() @IsUUID()
  doctorId?: string;

  @IsOptional() @IsString() @MaxLength(500)
  reason?: string;

  @IsOptional() @IsBoolean()
  force?: boolean;
}

export class CancelAppointmentDto {
  @IsString() @MinLength(1) @MaxLength(500)
  reason: string;
}

export class ListAppointmentsQueryDto extends PaginationQueryDto {
  /** Single local day (branch timezone), YYYY-MM-DD. */
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'date must be YYYY-MM-DD' })
  date?: string;

  /** Range start (inclusive): YYYY-MM-DD (local day) or ISO date-time. */
  @IsOptional() @IsString() @MaxLength(40)
  from?: string;

  /** Range end (inclusive for YYYY-MM-DD, exclusive for ISO date-time). */
  @IsOptional() @IsString() @MaxLength(40)
  to?: string;

  @IsOptional() @IsUUID()
  doctorId?: string;

  @IsOptional() @IsUUID()
  patientId?: string;

  /** Comma separated list of statuses. */
  @IsOptional() @IsString() @MaxLength(200)
  status?: string;

  /** Include CANCELLED appointments when no status filter is given. */
  @IsOptional() @IsIn(['true', 'false'])
  includeCancelled?: string;

  @IsOptional() @IsIn(['asc', 'desc'])
  order?: 'asc' | 'desc';
}

export const WAITLIST_STATUSES = ['WAITING', 'CONTACTED', 'BOOKED', 'CANCELLED'] as const;

export class CreateWaitlistDto {
  @IsUUID()
  patientId: string;

  @IsUUID()
  doctorId: string;

  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'preferredDate must be YYYY-MM-DD' })
  preferredDate?: string;
}

export class UpdateWaitlistDto {
  @IsIn(WAITLIST_STATUSES)
  status: (typeof WAITLIST_STATUSES)[number];
}

export class ListWaitlistQueryDto {
  @IsOptional() @IsUUID()
  doctorId?: string;

  @IsOptional() @IsIn(WAITLIST_STATUSES)
  status?: string;

  @IsOptional() @Type(() => String) @IsIn(['true', 'false'])
  includeClosed?: string;
}
