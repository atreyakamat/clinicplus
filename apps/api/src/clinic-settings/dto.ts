import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { DATE_RE, TIME_RE } from './timezone';
import { PaginationQueryDto } from '../common/pagination';

export class CreateClinicServiceDto {
  @IsString() @MinLength(1) @MaxLength(200)
  name: string;

  @IsOptional() @IsString() @MaxLength(2000)
  description?: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(5) @Max(600)
  duration?: number;

  /** Price in the clinic currency (2 decimals). */
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(9999999999)
  price: number;

  @IsOptional() @IsUUID()
  departmentId?: string;
}

export class UpdateClinicServiceDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(200)
  name?: string;

  @IsOptional() @IsString() @MaxLength(2000)
  description?: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(5) @Max(600)
  duration?: number;

  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(9999999999)
  price?: number;

  /** null clears the department. */
  @IsOptional() @IsUUID()
  departmentId?: string | null;

  @IsOptional() @IsIn(['ACTIVE', 'INACTIVE'])
  status?: 'ACTIVE' | 'INACTIVE';
}

export class ListServicesQueryDto extends PaginationQueryDto {
  @IsOptional() @IsString() @MaxLength(100)
  search?: string;

  @IsOptional() @IsUUID()
  departmentId?: string;

  @IsOptional() @IsIn(['true', 'false'])
  includeInactive?: string;
}

export class WorkingDayDto {
  @Type(() => Number) @IsInt() @Min(0) @Max(6)
  dayOfWeek: number;

  /** When true the clinic is closed that day (any times are ignored). */
  @IsOptional() @IsBoolean()
  closed?: boolean;

  @IsOptional() @Matches(TIME_RE, { message: 'openTime must be HH:mm' })
  openTime?: string;

  @IsOptional() @Matches(TIME_RE, { message: 'closeTime must be HH:mm' })
  closeTime?: string;

  @IsOptional() @Matches(TIME_RE, { message: 'breakStart must be HH:mm' })
  breakStart?: string;

  @IsOptional() @Matches(TIME_RE, { message: 'breakEnd must be HH:mm' })
  breakEnd?: string;
}

export class PutWorkingHoursDto {
  @IsArray() @ArrayMaxSize(7) @ValidateNested({ each: true }) @Type(() => WorkingDayDto)
  days: WorkingDayDto[];
}

export class CreateHolidayDto {
  @IsString() @MinLength(1) @MaxLength(200)
  name: string;

  @Matches(DATE_RE, { message: 'date must be YYYY-MM-DD' })
  date: string;

  @IsOptional() @IsString() @MaxLength(2000)
  description?: string;
}

export class UpdateHolidayDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(200)
  name?: string;

  @IsOptional() @Matches(DATE_RE, { message: 'date must be YYYY-MM-DD' })
  date?: string;

  @IsOptional() @IsString() @MaxLength(2000)
  description?: string;
}

export class ListHolidaysQueryDto {
  @IsOptional() @Matches(DATE_RE, { message: 'from must be YYYY-MM-DD' })
  from?: string;

  @IsOptional() @Matches(DATE_RE, { message: 'to must be YYYY-MM-DD' })
  to?: string;
}
