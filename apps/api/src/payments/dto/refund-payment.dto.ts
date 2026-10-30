import { Type } from 'class-transformer';
import { IsNotEmpty, IsNumber, IsString, MaxLength, Min } from 'class-validator';

export class RefundPaymentDto {
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2, allowNaN: false, allowInfinity: false })
  @Min(0.01)
  amount: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason: string;
}
