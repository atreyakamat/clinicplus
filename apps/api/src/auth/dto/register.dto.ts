import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { IsStrongPassword } from '../../common/validation/password';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class RegisterDto {
  // Owner account
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail()
  @IsNotEmpty()
  @MaxLength(254)
  email: string;

  @IsString()
  @IsNotEmpty()
  @IsStrongPassword()
  password: string;

  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  firstName: string;

  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  lastName: string;

  @Transform(trim)
  @IsString()
  @IsOptional()
  @MaxLength(20)
  phone?: string;

  // Clinic
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(120)
  clinicName: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(60)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: 'clinicSlug may contain only lowercase letters, digits and single hyphens',
  })
  clinicSlug: string;

  @Transform(trim)
  @IsString()
  @IsOptional()
  @MaxLength(120)
  specialization?: string;

  @Transform(trim)
  @IsString()
  @IsOptional()
  @MaxLength(200)
  address?: string;

  @Transform(trim)
  @IsString()
  @IsOptional()
  @MaxLength(80)
  city?: string;

  @Transform(trim)
  @IsString()
  @IsOptional()
  @MaxLength(80)
  state?: string;

  @Transform(trim)
  @IsString()
  @IsOptional()
  @MaxLength(80)
  country?: string;

  /** The owner also practises (solo-doctor clinic): grant the Doctor role as well. */
  @IsOptional()
  @IsBoolean()
  isPractitioner?: boolean;
}
