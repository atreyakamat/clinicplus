import { Transform } from 'class-transformer';
import { IsEmail, IsNotEmpty, IsOptional, IsString, IsUrl, Matches, MaxLength, MinLength, ValidateIf } from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const HEX = /^#[0-9a-fA-F]{6}$/;
/** http(s) URL or an inline image data URL (small logos / letterheads uploaded from the browser). */
const IMAGE_REF = /^(https?:\/\/\S+|data:image\/(png|jpe?g|svg\+xml|webp|gif);base64,[A-Za-z0-9+/=]+)$/;

export class UpdateBrandingDto {
  @IsOptional() @ValidateIf((_, v) => v !== null && v !== '') @IsString() @MaxLength(700_000) @Matches(IMAGE_REF, { message: 'logoUrl must be an http(s) URL or an image data URL' })
  logoUrl?: string | null;

  @IsOptional() @IsString() @Matches(HEX, { message: 'primaryColor must be a #RRGGBB colour' })
  primaryColor?: string;

  @IsOptional() @IsString() @Matches(HEX, { message: 'secondaryColor must be a #RRGGBB colour' })
  secondaryColor?: string;

  @IsOptional() @ValidateIf((_, v) => v !== null && v !== '') @IsString() @MaxLength(700_000) @Matches(IMAGE_REF, { message: 'letterheadUrl must be an http(s) URL or an image data URL' })
  letterheadUrl?: string | null;

  @IsOptional() @ValidateIf((_, v) => v !== null && v !== '') @IsString() @MaxLength(700_000) @Matches(IMAGE_REF, { message: 'watermarkUrl must be an http(s) URL or an image data URL' })
  watermarkUrl?: string | null;

  @Transform(trim) @IsOptional() @ValidateIf((_, v) => v !== null) @IsString() @MaxLength(500)
  footerText?: string | null;
}

export class UpdateOrganizationDto extends UpdateBrandingDto {
  @Transform(trim) @IsOptional() @IsString() @IsNotEmpty() @MinLength(2) @MaxLength(120)
  name?: string;

  @Transform(trim) @IsOptional() @ValidateIf((_, v) => v !== null && v !== '') @IsString() @MaxLength(200)
  legalName?: string | null;

  @Transform(trim) @IsOptional() @ValidateIf((_, v) => v !== null && v !== '') @IsEmail() @MaxLength(254)
  email?: string | null;

  @Transform(trim) @IsOptional() @ValidateIf((_, v) => v !== null && v !== '') @IsString() @MaxLength(20) @Matches(/^[+0-9 ()-]{6,20}$/, { message: 'phone must be a valid phone number' })
  phone?: string | null;

  @Transform(trim) @IsOptional() @ValidateIf((_, v) => v !== null && v !== '') @IsUrl({ require_protocol: true }) @MaxLength(200)
  website?: string | null;
}
