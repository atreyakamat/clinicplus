import { Transform, Type } from 'class-transformer';
import {
  IsEmail,
  IsIn,
  IsISO8601,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class PortalAddressDto {
  @IsOptional() @IsString() @MaxLength(200) addressLine1?: string;
  @IsOptional() @IsString() @MaxLength(200) addressLine2?: string;
  @IsOptional() @IsString() @MaxLength(100) city?: string;
  @IsOptional() @IsString() @MaxLength(100) state?: string;
  @IsOptional() @IsString() @MaxLength(100) country?: string;
  @IsOptional() @IsString() @MaxLength(20) postalCode?: string;
}

/** Patients may only self-edit contact details — never clinical or identity fields. */
export class UpdatePortalProfileDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(20)
  phone?: string;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail()
  @MaxLength(254)
  email?: string;

  @IsOptional()
  @IsIn(['SMS', 'WHATSAPP', 'EMAIL'])
  preferredChannel?: string;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => PortalAddressDto)
  address?: PortalAddressDto;
}

export class PortalBookAppointmentDto {
  @IsString()
  @IsNotEmpty()
  doctorId: string;

  @IsISO8601()
  scheduledStart: string;

  @IsISO8601()
  scheduledEnd: string;

  @IsOptional() @IsString() @MaxLength(100) appointmentType?: string;
  @IsOptional() @IsString() @MaxLength(500) notes?: string;
}

export class PortalCancelAppointmentDto {
  @IsOptional() @IsString() @MaxLength(300) reason?: string;
}

export class PortalSlotsQueryDto {
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'date must be YYYY-MM-DD' })
  date: string;
}

/** Staff action: turn the portal on for a patient. */
export class EnablePortalDto {
  /**
   * `password` (default) mints a one-time temporary password returned to staff
   * to hand over; `otp` leaves the account password-less and the patient signs
   * in with a one-time code.
   */
  @IsOptional()
  @IsIn(['password', 'otp'])
  mode?: 'password' | 'otp';
}
