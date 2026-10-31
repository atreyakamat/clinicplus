import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsOptional, IsString, IsUUID, Matches, MaxLength, MinLength } from 'class-validator';
import { TEMPLATE_PURPOSES } from '../../messages/template-render';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class CreateTemplateDto {
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @IsIn(['SMS', 'WHATSAPP'])
  channel!: 'SMS' | 'WHATSAPP';

  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(1600)
  content!: string;

  @IsOptional()
  @IsIn(TEMPLATE_PURPOSES)
  purpose?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  /** Twilio Content SID (HX...) of an approved WhatsApp template. */
  @IsOptional()
  @Transform(({ value }) => (value === '' ? null : value))
  @IsString()
  @Matches(/^HX[0-9a-fA-F]{32}$/, { message: 'externalTemplateId must be a Twilio Content SID (HX + 32 hex chars)' })
  externalTemplateId?: string | null;
}

export class UpdateTemplateDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsIn(['SMS', 'WHATSAPP'])
  channel?: 'SMS' | 'WHATSAPP';

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(1600)
  content?: string;

  @IsOptional()
  @IsIn(TEMPLATE_PURPOSES)
  purpose?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @Transform(({ value }) => (value === '' ? null : value))
  @IsString()
  @Matches(/^HX[0-9a-fA-F]{32}$/, { message: 'externalTemplateId must be a Twilio Content SID (HX + 32 hex chars)' })
  externalTemplateId?: string | null;
}

export class PreviewTemplateDto {
  @IsString()
  @MaxLength(1600)
  content!: string;

  /** Render with this patient's real data (else sample values). */
  @IsOptional()
  @IsUUID()
  patientId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  link?: string;
}
