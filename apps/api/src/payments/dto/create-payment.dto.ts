import {
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  IsIn,
} from 'class-validator';

export class CreatePaymentDto {
  @IsNotEmpty()
  @IsUUID()
  invoiceId: string;

  @IsNotEmpty()
  @IsNumber()
  amount: number;

  @IsNotEmpty()
  @IsString()
  @IsIn(['CASH', 'UPI', 'CARD'], {
    message: 'paymentMethod must be either CASH, UPI, or CARD',
  })
  paymentMethod: string;

  @IsOptional()
  @IsString()
  transactionReference?: string;

  @IsOptional()
  @IsString()
  @IsIn(['PENDING', 'PAID', 'FAILED', 'REFUNDED'], {
    message: 'paymentStatus must be a valid PaymentStatus value',
  })
  paymentStatus?: string;
}