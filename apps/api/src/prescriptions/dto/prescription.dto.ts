import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { PaginationQueryDto } from '../../common/pagination';

export const PRESCRIPTION_STATUSES = ['ACTIVE', 'COMPLETED', 'CANCELLED'];

export class PrescriptionItemDto {
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  medicineName: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  dosage?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  frequency?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  duration?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  instructions?: string;
}

export class CreatePrescriptionDto {
  @IsUUID()
  patientId: string;

  @IsOptional()
  @IsUUID()
  consultationId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => PrescriptionItemDto)
  items: PrescriptionItemDto[];

  /** Must be true to save a prescription that triggers allergy / duplicate warnings. */
  @IsOptional()
  @IsBoolean()
  acknowledgeWarnings?: boolean;
}

export class UpdatePrescriptionDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => PrescriptionItemDto)
  items?: PrescriptionItemDto[];

  @IsOptional()
  @IsBoolean()
  acknowledgeWarnings?: boolean;
}

export class CancelPrescriptionDto {
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason: string;
}

export class CheckSafetyDto {
  @IsUUID()
  patientId: string;

  @IsOptional()
  @IsUUID()
  excludePrescriptionId?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => PrescriptionItemDto)
  items: PrescriptionItemDto[];
}

export class ListPrescriptionsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsUUID()
  patientId?: string;

  @IsOptional()
  @IsUUID()
  doctorId?: string;

  @IsOptional()
  @IsUUID()
  consultationId?: string;

  @IsOptional()
  @IsIn(PRESCRIPTION_STATUSES)
  status?: string;
}
