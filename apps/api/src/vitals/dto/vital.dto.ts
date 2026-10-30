import { IsInt, IsNumber, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { PaginationQueryDto } from '../../common/pagination';

/** Units: height cm, weight kg, temperature °C, BP mmHg, SpO2 %. */
export class CreateVitalDto {
  @IsUUID()
  consultationId: string;

  @IsOptional()
  @IsNumber()
  @Min(20)
  @Max(260)
  height?: number;

  @IsOptional()
  @IsNumber()
  @Min(0.3)
  @Max(400)
  weight?: number;

  @IsOptional()
  @IsNumber()
  @Min(30)
  @Max(45)
  temperature?: number;

  @IsOptional()
  @IsInt()
  @Min(20)
  @Max(250)
  pulse?: number;

  @IsOptional()
  @IsInt()
  @Min(4)
  @Max(80)
  respiratoryRate?: number;

  @IsOptional()
  @IsInt()
  @Min(50)
  @Max(280)
  bloodPressureSystolic?: number;

  @IsOptional()
  @IsInt()
  @Min(20)
  @Max(180)
  bloodPressureDiastolic?: number;

  @IsOptional()
  @IsInt()
  @Min(50)
  @Max(100)
  spo2?: number;
}

export class VitalsQueryDto {
  @IsUUID()
  consultationId: string;
}

export class VitalsHistoryQueryDto extends PaginationQueryDto {}
