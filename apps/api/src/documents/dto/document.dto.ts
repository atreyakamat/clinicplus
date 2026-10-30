import { IsDateString, IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { PaginationQueryDto } from '../../common/pagination';

export const DOCUMENT_TYPES = [
  'LAB_REPORT',
  'IMAGING',
  'PRESCRIPTION',
  'DISCHARGE_SUMMARY',
  'REFERRAL',
  'CONSENT',
  'INSURANCE',
  'ID_PROOF',
  'OTHER',
];

export class UploadDocumentDto {
  @IsUUID()
  patientId: string;

  @IsIn(DOCUMENT_TYPES)
  documentType: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title: string;

  @IsOptional()
  @IsUUID()
  consultationId?: string;

  /** Date of the lab / imaging report (defaults to upload time). */
  @IsOptional()
  @IsDateString()
  reportDate?: string;
}

export class UpdateDocumentDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsIn(DOCUMENT_TYPES)
  documentType?: string;

  @IsOptional()
  @IsUUID()
  consultationId?: string;
}

export class ListDocumentsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsUUID()
  patientId?: string;

  @IsOptional()
  @IsIn(DOCUMENT_TYPES)
  documentType?: string;

  @IsOptional()
  @IsUUID()
  consultationId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;
}

export class DownloadQueryDto {
  @IsOptional()
  @IsIn(['inline', 'attachment'])
  disposition?: 'inline' | 'attachment';
}
