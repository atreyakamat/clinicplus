import { IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { PaginationQueryDto } from '../../common/pagination';
import { BLOOD_GROUPS, GENDERS } from './create-patient.dto';

export class ListPatientsQueryDto extends PaginationQueryDto {
  /** Name, phone, email or patient code. */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @IsOptional()
  @IsIn(GENDERS)
  gender?: string;

  @IsOptional()
  @IsIn(BLOOD_GROUPS)
  bloodGroup?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  tag?: string;

  @IsOptional()
  @IsIn(['ACTIVE', 'INACTIVE', 'ARCHIVED'])
  status?: 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';

  @IsOptional()
  @IsIn(['createdAt', 'name', 'patientCode', 'updatedAt'])
  sortBy?: 'createdAt' | 'name' | 'patientCode' | 'updatedAt';

  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortDir?: 'asc' | 'desc';
}

export class SearchPatientsQueryDto {
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  q: string;
}

export class DuplicateCheckQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  firstName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  lastName?: string;

  @IsOptional()
  @IsUUID()
  excludeId?: string;
}
