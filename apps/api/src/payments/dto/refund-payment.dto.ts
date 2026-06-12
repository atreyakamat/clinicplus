import {
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  IsIn,
} from 'class-validator';

export class RefundPaymentDto {
  @IsNotEmpty()
  @IsUUID()
  paymentId: string;

  @IsNotEmpty()
  @IsNumber()
  amount: number;

  @IsOptional()
  @IsString()
  reason?: string;
}
