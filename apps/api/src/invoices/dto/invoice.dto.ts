import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { PaginationQueryDto } from '../../common/pagination';

const MONEY = { maxDecimalPlaces: 2, allowNaN: false, allowInfinity: false };

export class InvoiceItemDto {
  /** Catalog service; name and price default from it when omitted. */
  @IsOptional()
  @IsUUID()
  serviceId?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  itemName?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10000)
  quantity: number;

  /** Overrides the catalog price. Required for free-text items. */
  @IsOptional()
  @Type(() => Number)
  @IsNumber(MONEY)
  @Min(0)
  unitPrice?: number;
}

export class CreateInvoiceDto {
  @IsUUID()
  patientId: string;

  @IsOptional()
  @IsUUID()
  appointmentId?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => InvoiceItemDto)
  items: InvoiceItemDto[];

  /** Absolute discount amount. */
  @IsOptional()
  @Type(() => Number)
  @IsNumber(MONEY)
  @Min(0)
  discount?: number;

  /** Absolute tax amount. */
  @IsOptional()
  @Type(() => Number)
  @IsNumber(MONEY)
  @Min(0)
  tax?: number;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  /** true = issue immediately (status SENT) instead of saving a draft. */
  @IsOptional()
  @IsBoolean()
  issue?: boolean;
}

export class UpdateInvoiceDto {
  @IsOptional()
  @IsUUID()
  appointmentId?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => InvoiceItemDto)
  items?: InvoiceItemDto[];

  @IsOptional()
  @Type(() => Number)
  @IsNumber(MONEY)
  @Min(0)
  discount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber(MONEY)
  @Min(0)
  tax?: number;

  @IsOptional()
  @IsDateString()
  dueDate?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class VoidInvoiceDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason: string;
}

export const INVOICE_STATUSES = ['DRAFT', 'SENT', 'PARTIALLY_PAID', 'PAID', 'VOID', 'OVERDUE'] as const;

export class ListInvoicesQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsIn(INVOICE_STATUSES as unknown as string[])
  status?: string;

  @IsOptional()
  @IsUUID()
  patientId?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'from must be YYYY-MM-DD' })
  from?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'to must be YYYY-MM-DD' })
  to?: string;

  /** Only invoices with money still due (SENT, PARTIALLY_PAID, OVERDUE). */
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true' || value === '1')
  @IsBoolean()
  outstanding?: boolean;

  /** Invoice number or patient name / phone fragment. */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;
}
