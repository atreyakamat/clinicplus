import { IsEmail, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreatePatientDto {
  @IsString()
  @IsOptional()
  patientCode?: string;

  @IsString()
  firstName: string;

  @IsString()
  @IsOptional()
  middleName?: string;

  @IsString()
  lastName: string;

  @IsString()
  @IsOptional()
  gender?: string;

  @IsOptional()
  dateOfBirth?: Date;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsEmail()
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  bloodGroup?: string;

  @IsString()
  @IsOptional()
  maritalStatus?: string;

  @IsString()
  @IsOptional()
  occupation?: string;

  @IsString()
  @IsOptional()
  abhaNumber?: string;
}
