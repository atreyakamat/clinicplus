import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { PaginationQueryDto } from '../../common/pagination';

export const OUTBOUND_CHANNELS = ['SMS', 'WHATSAPP'] as const;

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/** Legacy body for POST /messages/sms and /messages/whatsapp. */
export class SendLegacyMessageDto {
  @IsUUID()
  patientId!: string;

  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(1600)
  content!: string;
}

export class SendMessageDto {
  @IsUUID()
  patientId!: string;

  @IsOptional()
  @IsIn(OUTBOUND_CHANNELS as unknown as string[])
  channel?: 'SMS' | 'WHATSAPP';

  /** Either a body or a templateId is required. */
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(1600)
  body?: string;

  @IsOptional()
  @IsUUID()
  templateId?: string;

  /** Optional {{link}} value when rendering a template. */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  link?: string;
}

export class ReplyDto {
  @IsOptional()
  @IsIn(OUTBOUND_CHANNELS as unknown as string[])
  channel?: 'SMS' | 'WHATSAPP';

  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(1600)
  body!: string;
}

export class MessageLogQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsIn(['SMS', 'WHATSAPP', 'EMAIL'])
  channel?: string;

  @IsOptional()
  @IsIn(['INBOUND', 'OUTBOUND'])
  direction?: 'INBOUND' | 'OUTBOUND';

  @IsOptional()
  @IsString()
  @MaxLength(40)
  status?: string;

  @IsOptional()
  @IsUUID()
  patientId?: string;

  /** "automation" (reminder keys), "campaign", or "manual". */
  @IsOptional()
  @IsIn(['automation', 'campaign', 'manual'])
  source?: string;
}

export class ConversationQueryDto extends PaginationQueryDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  search?: string;
}
