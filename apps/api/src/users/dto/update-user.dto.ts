import { Transform, Type } from 'class-transformer';
import { IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/** Fields a staff member (or an admin on their behalf) may change. Credentials, tenant and status are NOT updatable here. */
export class UpdateUserDto {
  @Transform(trim) @IsOptional() @IsString() @MaxLength(80)
  firstName?: string;

  @Transform(trim) @IsOptional() @IsString() @MaxLength(80)
  lastName?: string;

  @Transform(trim) @IsOptional() @IsString() @MaxLength(20)
  phone?: string;

  @IsOptional() @IsString() @MaxLength(500_000)
  avatarUrl?: string;

  @Transform(trim) @IsOptional() @IsString() @MaxLength(120)
  qualification?: string;

  @Transform(trim) @IsOptional() @IsString() @MaxLength(120)
  specialization?: string;

  @Transform(trim) @IsOptional() @IsString() @MaxLength(60)
  registrationNumber?: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(80)
  experienceYears?: number;

  @IsOptional() @IsString() @MaxLength(2000)
  bio?: string;

  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(1_000_000)
  consultationFee?: number;

  @IsOptional() @IsString() @MaxLength(500_000)
  signatureUrl?: string;
}
