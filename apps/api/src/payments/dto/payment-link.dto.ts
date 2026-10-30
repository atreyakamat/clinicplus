import { IsBoolean, IsOptional } from 'class-validator';

export class PaymentLinkDto {
  /** Also text the link to the patient (uses the messaging provider). */
  @IsOptional()
  @IsBoolean()
  send?: boolean;
}
