import { Transform } from 'class-transformer';
import { IsNotEmpty, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/** A 6-digit TOTP code from an authenticator app. */
export class EnableTwoFactorDto {
  @Transform(trim)
  @IsString()
  @Matches(/^[0-9]{6}$/, { message: 'code must be a 6-digit authenticator code' })
  code: string;
}

/**
 * Disabling 2FA requires proof of possession: either a current authenticator
 * code or the account password. The service rejects a body with neither.
 */
export class DisableTwoFactorDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Matches(/^[0-9]{6}$/, { message: 'code must be a 6-digit authenticator code' })
  code?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  password?: string;
}

/**
 * Completes a login that returned `twoFactorRequired`. `code` is either a 6-digit
 * TOTP code or a one-time recovery code (letters, digits and dashes).
 */
export class VerifyTwoFactorDto {
  @IsString()
  @IsNotEmpty({ message: 'challengeToken is required' })
  @MaxLength(512)
  challengeToken: string;

  @Transform(trim)
  @IsString()
  @MinLength(6)
  @MaxLength(20)
  @Matches(/^[A-Za-z0-9-]{6,20}$/, { message: 'code must be an authenticator or recovery code' })
  code: string;
}
