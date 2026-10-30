import { IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export { PatientAddressDto, EmergencyContactDto, PatientTagDto } from './create-patient.dto';

export class FamilyMemberDto {
  @IsUUID()
  relatedPatientId: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  relationship?: string;
}

export class PatientNoteDto {
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  note: string;
}

export class ArchivePatientDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
