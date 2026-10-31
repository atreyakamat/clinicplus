import { IsDateString, IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { PaginationQueryDto } from '../../common/pagination';

export class CreateConsultationDto {
  @IsUUID()
  patientId: string;

  @IsOptional()
  @IsUUID()
  appointmentId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  chiefComplaint?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10000)
  historyOfPresentIllness?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10000)
  clinicalAssessment?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10000)
  treatmentPlan?: string;
}

export class UpdateConsultationDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  chiefComplaint?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10000)
  historyOfPresentIllness?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10000)
  clinicalAssessment?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10000)
  treatmentPlan?: string;
}

export class ConsultationAddendumDto {
  @IsString()
  @MinLength(3)
  @MaxLength(5000)
  note: string;
}

export class ListConsultationsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsUUID()
  patientId?: string;

  @IsOptional()
  @IsUUID()
  doctorId?: string;

  @IsOptional()
  @IsIn(['DRAFT', 'COMPLETED'])
  status?: 'DRAFT' | 'COMPLETED';

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  /** "true" limits the list to the caller's own consultations. */
  @IsOptional()
  @IsIn(['true', 'false'])
  mine?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;
}
