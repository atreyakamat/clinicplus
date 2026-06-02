import { IsDateString, IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateAppointmentDto {
  @IsNotEmpty()
  patientId: string;

  @IsNotEmpty()
  doctorId: string;

  @IsNotEmpty()
  @IsDateString()
  scheduledStart: string;

  @IsNotEmpty()
  @IsDateString()
  scheduledEnd: string;

  @IsString()
  @IsOptional()
  appointmentType?: string;

  @IsString()
  @IsOptional()
  appointmentSource?: string;

  @IsString()
  @IsOptional()
  notes?: string;
}