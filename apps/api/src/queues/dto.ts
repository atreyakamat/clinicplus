import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export const PRIORITY_LEVELS = ['NORMAL', 'HIGH', 'EMERGENCY'] as const;
export type PriorityLevel = (typeof PRIORITY_LEVELS)[number];

export const QUEUE_STATUSES = ['WAITING', 'CALLED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'] as const;
export type QueueStatus = (typeof QUEUE_STATUSES)[number];

export class CheckInDto {
  @IsUUID()
  appointmentId: string;

  @IsOptional() @IsIn(PRIORITY_LEVELS)
  priority?: PriorityLevel;

  @IsOptional() @IsString() @MaxLength(50)
  room?: string;
}

export class WalkInDto {
  @IsUUID()
  patientId: string;

  @IsUUID()
  doctorId: string;

  @IsOptional() @IsIn(PRIORITY_LEVELS)
  priority?: PriorityLevel;

  @IsOptional() @IsString() @MaxLength(50)
  room?: string;

  @IsOptional() @IsString() @MaxLength(2000)
  notes?: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(5) @Max(240)
  durationMinutes?: number;
}

export class UpdateEntryDto {
  @IsOptional() @IsIn(PRIORITY_LEVELS)
  priority?: PriorityLevel;

  /** Empty string clears the room. */
  @IsOptional() @IsString() @MaxLength(50)
  room?: string;
}

export class UpdateEntryStatusDto {
  @IsIn(QUEUE_STATUSES)
  status: QueueStatus;
}

export class CallNextDto {
  @IsOptional() @IsString() @MaxLength(50)
  room?: string;

  /** Only call patients of this doctor. */
  @IsOptional() @IsUUID()
  doctorId?: string;
}

export class ReorderDto {
  /** WAITING entry ids in the desired order (first = next to be called). Priority bands still apply. */
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(500) @IsUUID('all', { each: true })
  entryIds: string[];
}
