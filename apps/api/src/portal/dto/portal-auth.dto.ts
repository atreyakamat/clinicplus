import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, Matches, MaxLength, MinLength } from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const lower = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().toLowerCase() : value);

/**
 * The clinic the patient belongs to. The portal is multi-tenant and a phone /
 * e-mail is only unique within one clinic, so every auth request names the
 * clinic by its slug. The web login screen captures it once (e.g. from the
 * invite link) and keeps it with the session.
 */
class PortalClinicScopedDto {
  @Transform(lower)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  clinicSlug: string;

  /** Phone number or e-mail address. */
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(254)
  identifier: string;
}

export class PortalLoginDto extends PortalClinicScopedDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  password: string;
}

export class PortalOtpRequestDto extends PortalClinicScopedDto {}

export class PortalOtpVerifyDto extends PortalClinicScopedDto {
  @Transform(trim)
  @IsString()
  @Matches(/^\d{4,8}$/, { message: 'code must be a numeric one-time code' })
  code: string;
}

export class PortalRefreshDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(32)
  @MaxLength(256)
  refreshToken: string;
}

export class PortalLogoutDto extends PortalRefreshDto {}
