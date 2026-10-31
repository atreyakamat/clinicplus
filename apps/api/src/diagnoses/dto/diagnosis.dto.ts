import { IsIn, IsOptional, IsString, IsUUID, Matches, MaxLength, MinLength, ValidateIf } from 'class-validator';

export const DIAGNOSIS_SEVERITIES = ['MILD', 'MODERATE', 'SEVERE'];
/** ICD-10 style code, e.g. J06.9, E11, I10, A09.0 (ICD-11 codes like 1A00 also accepted). */
const ICD_RE = /^[A-Z0-9][A-Z0-9]{1,3}(\.[A-Z0-9]{1,4})?$/i;

export class CreateDiagnosisDto {
  @IsUUID()
  consultationId: string;

  @IsOptional()
  @IsString()
  @Matches(ICD_RE, { message: 'icdCode must look like an ICD code (e.g. J06.9)' })
  icdCode?: string;

  @IsString()
  @MinLength(2)
  @MaxLength(300)
  diagnosisName: string;

  @IsOptional()
  @IsIn(DIAGNOSIS_SEVERITIES)
  severity?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class UpdateDiagnosisDto {
  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== '')
  @IsString()
  @Matches(ICD_RE, { message: 'icdCode must look like an ICD code (e.g. J06.9)' })
  icdCode?: string | null;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(300)
  diagnosisName?: string;

  @IsOptional()
  @IsIn(DIAGNOSIS_SEVERITIES)
  severity?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class DiagnosesQueryDto {
  @IsOptional()
  @IsUUID()
  consultationId?: string;

  @IsOptional()
  @IsUUID()
  patientId?: string;
}
