import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsOptional, IsString, IsUUID, Matches } from 'class-validator';
import { PaginationQueryDto } from '../../common/pagination';

export class ListPaymentsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsUUID()
  invoiceId?: string;

  @IsOptional()
  @IsString()
  @IsIn(['CASH', 'CARD', 'UPI', 'BANK_TRANSFER', 'CHEQUE', 'OTHER', 'STRIPE'])
  paymentMethod?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  from?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  to?: string;

  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  includeRefunds?: boolean;
}
