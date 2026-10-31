import { Transform, Type } from 'class-transformer';

import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

const upper = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().toUpperCase() : value);
const emptyToUndefined = ({ value }: { value: unknown }) => (value === '' || value === null ? undefined : value);

export const GENDERS = ['MALE', 'FEMALE', 'OTHER', 'UNKNOWN'];
export const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
export const CHANNELS = ['SMS', 'WHATSAPP', 'EMAIL', 'CALL'];
const PHONE_RE = /^\+?[0-9][0-9\s-]{6,18}$/;

export class PatientAddressDto {
  @IsOptional()
  @IsIn(['HOME', 'WORK', 'OTHER'])
  addressType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  addressLine1?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  addressLine2?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  state?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  country?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  postalCode?: string;
}

export class EmergencyContactDto {
  @IsString()
  @MinLength(1)
  @MaxLength(150)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  relationship?: string;

  @IsOptional()
  @Matches(PHONE_RE, { message: 'phone must be a valid phone number' })
  phone?: string;

  @IsOptional()
  @IsEmail()
  email?: string;
}

export class PatientTagDto {
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  tagName: string;

  @IsOptional()
  @Matches(/^#[0-9a-fA-F]{6}$/, { message: 'tagColor must be a hex colour like #1FA971' })
  tagColor?: string;
}

/** Demographic fields shared by create and update. Tenant/audit columns are never accepted from clients. */
export class PatientDemographicsDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  middleName?: string;

  @IsOptional()
  @Transform(upper)
  @IsIn(GENDERS)
  gender?: string;

  @IsOptional()
  @Transform(emptyToUndefined)
  @IsDateString()
  dateOfBirth?: string;

  @IsOptional()
  @Matches(PHONE_RE, { message: 'phone must be a valid phone number' })
  phone?: string;

  @IsOptional()
  @Transform(emptyToUndefined)
  @IsEmail()
  email?: string;

  @IsOptional()
  @Transform(upper)
  @IsIn(BLOOD_GROUPS)
  bloodGroup?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  maritalStatus?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  occupation?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  abhaNumber?: string;

  @IsOptional()
  @IsBoolean()
  communicationOptIn?: boolean;

  @IsOptional()
  @Transform(upper)
  @IsIn(CHANNELS)
  preferredChannel?: string;
}

export class CreatePatientDto extends PatientDemographicsDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  firstName: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  lastName: string;

  /** Optional clinic-assigned code; generated (PAT-000123) when omitted. */
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z0-9-]{2,30}$/, { message: 'patientCode may contain letters, digits and dashes' })
  patientCode?: string;

  /** Register even if a patient with the same phone exists (e.g. family members sharing a phone). */
  @IsOptional()
  @IsBoolean()
  allowDuplicate?: boolean;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @ValidateNested({ each: true })
  @Type(() => PatientAddressDto)
  addresses?: PatientAddressDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @ValidateNested({ each: true })
  @Type(() => EmergencyContactDto)
  emergencyContacts?: EmergencyContactDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => PatientTagDto)
  tags?: PatientTagDto[];
}
