import { Type } from 'class-transformer';
import { IsIn, IsNumber, IsOptional, IsString, IsUUID, Matches, MaxLength, Min } from 'class-validator';

/** Methods a staff member can record at the desk. STRIPE payments only come from the webhook. */
export const MANUAL_PAYMENT_METHODS = ['CASH', 'CARD', 'UPI', 'BANK_TRANSFER', 'CHEQUE', 'OTHER'] as const;

export class RecordPaymentDto {
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2, allowNaN: false, allowInfinity: false })
  @Min(0.01)
  amount: number;

  @IsString()
  @IsIn(MANUAL_PAYMENT_METHODS as unknown as string[], {
    message: `paymentMethod must be one of ${MANUAL_PAYMENT_METHODS.join(', ')}`,
  })
  paymentMethod: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  transactionReference?: string;

  /** Client-generated key; a retried request with the same key returns the original payment. */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Matches(/^[A-Za-z0-9_\-:.]+$/, { message: 'idempotencyKey may only contain letters, digits and _-:.' })
  idempotencyKey?: string;
}

export class CreatePaymentDto extends RecordPaymentDto {
  @IsUUID()
  invoiceId: string;
}
