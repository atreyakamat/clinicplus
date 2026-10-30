import { IsDateString, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export const ALLERGY_SEVERITIES = ['MILD', 'MODERATE', 'SEVERE', 'LIFE_THREATENING'];
export const CONDITION_STATUSES = ['ACTIVE', 'CHRONIC', 'CONTROLLED', 'RESOLVED'];

export class CreateAllergyDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  allergyName: string;

  @IsOptional()
  @IsIn(ALLERGY_SEVERITIES)
  severity?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

export class UpdateAllergyDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  allergyName?: string;

  @IsOptional()
  @IsIn(ALLERGY_SEVERITIES)
  severity?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

export class CreateConditionDto {
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  conditionName: string;

  @IsOptional()
  @IsDateString()
  diagnosedDate?: string;

  @IsOptional()
  @IsIn(CONDITION_STATUSES)
  status?: string;
}

export class UpdateConditionDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  conditionName?: string;

  @IsOptional()
  @IsDateString()
  diagnosedDate?: string;

  @IsOptional()
  @IsIn(CONDITION_STATUSES)
  status?: string;
}
