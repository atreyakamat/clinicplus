import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { DATE_RE, TIME_RE } from '../clinic-settings/timezone';

export class ListDoctorsQueryDto {
  @IsOptional() @IsString() @MaxLength(100)
  search?: string;

  @IsOptional() @IsString() @MaxLength(100)
  specialization?: string;
}

export class UpdateDoctorProfileDto {
  @IsOptional() @IsString() @MaxLength(200)
  qualification?: string;

  @IsOptional() @IsString() @MaxLength(200)
  specialization?: string;

  @IsOptional() @IsString() @MaxLength(100)
  registrationNumber?: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(80)
  experienceYears?: number;

  @IsOptional() @IsString() @MaxLength(5000)
  bio?: string;

  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(9999999999)
  consultationFee?: number;

  /** URL or storage key of the signature image (uploaded through the documents/storage flow). */
  @IsOptional() @IsString() @MaxLength(1000)
  signatureUrl?: string;

  @IsOptional() @IsString() @MaxLength(30)
  phone?: string;
}

export class AvailabilityBlockDto {
  /** 0 = Sunday ... 6 = Saturday */
  @Type(() => Number) @IsInt() @Min(0) @Max(6)
  dayOfWeek: number;

  @Matches(TIME_RE, { message: 'startTime must be HH:mm' })
  startTime: string;

  @Matches(TIME_RE, { message: 'endTime must be HH:mm' })
  endTime: string;

  @Type(() => Number) @IsInt() @Min(5) @Max(240)
  slotDuration: number;
}

export class UpdateAvailabilityBlockDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(6)
  dayOfWeek?: number;

  @IsOptional() @Matches(TIME_RE, { message: 'startTime must be HH:mm' })
  startTime?: string;

  @IsOptional() @Matches(TIME_RE, { message: 'endTime must be HH:mm' })
  endTime?: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(5) @Max(240)
  slotDuration?: number;
}

export class PutAvailabilityDto {
  @IsArray() @ArrayMaxSize(70) @ValidateNested({ each: true }) @Type(() => AvailabilityBlockDto)
  blocks: AvailabilityBlockDto[];
}

export class CreateLeaveDto {
  /** YYYY-MM-DD (whole day, branch timezone) or an ISO date-time for a partial day. */
  @IsString() @MaxLength(40)
  startDate: string;

  /** YYYY-MM-DD (inclusive, whole day) or an ISO date-time. */
  @IsString() @MaxLength(40)
  endDate: string;

  @IsOptional() @IsString() @MaxLength(500)
  reason?: string;
}

export class UpdateLeaveDto {
  @IsOptional() @IsString() @MaxLength(40)
  startDate?: string;

  @IsOptional() @IsString() @MaxLength(40)
  endDate?: string;

  @IsOptional() @IsString() @MaxLength(500)
  reason?: string;
}

export class ListLeavesQueryDto {
  /** Only leaves ending on/after this date (YYYY-MM-DD). Defaults to all. */
  @IsOptional() @Matches(DATE_RE, { message: 'from must be YYYY-MM-DD' })
  from?: string;
}

export class SlotsQueryDto {
  @Matches(DATE_RE, { message: 'date must be YYYY-MM-DD' })
  date: string;

  /** Desired appointment length in minutes (e.g. a service duration). Defaults to the availability slot length. */
  @IsOptional() @Type(() => Number) @IsInt() @Min(5) @Max(480)
  duration?: number;

  /** Ignore this appointment when computing conflicts (used when rescheduling). */
  @IsOptional() @IsString() @MaxLength(40)
  excludeAppointmentId?: string;
}
