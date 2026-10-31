import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { PatientDemographicsDto } from './create-patient.dto';

/**
 * Editable patient fields. organizationId / branchId / status / patientCode and
 * audit columns are intentionally absent (whitelist strips them).
 */
export class UpdatePatientDto extends PatientDemographicsDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  firstName?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  lastName?: string;
}
