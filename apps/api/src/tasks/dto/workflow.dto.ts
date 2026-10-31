import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { TASK_PRIORITIES } from './task.dto';
import type { TaskPriorityValue } from './task.dto';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class WorkflowStepDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  /** Days after the workflow start date that the task is due. */
  @IsInt()
  @Min(0)
  @Max(365)
  offsetDays: number;

  /** Role name (e.g. "Receptionist", "Doctor"); the first active user with it in the branch is assigned. */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  assigneeRole?: string;

  @IsOptional()
  @IsIn(TASK_PRIORITIES)
  priority?: TaskPriorityValue;
}

export class CreateWorkflowTemplateDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  /** Informational trigger label, e.g. MANUAL, NEW_PATIENT, POST_PROCEDURE. */
  @IsOptional()
  @IsString()
  @MaxLength(50)
  trigger?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => WorkflowStepDto)
  steps: WorkflowStepDto[];
}

export class UpdateWorkflowTemplateDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  trigger?: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => WorkflowStepDto)
  steps?: WorkflowStepDto[];

  @IsOptional()
  @IsIn(['ACTIVE', 'INACTIVE'])
  status?: 'ACTIVE' | 'INACTIVE';
}

export class StartWorkflowDto {
  @IsUUID()
  patientId: string;

  /** Defaults to now. Step due dates are startDate + offsetDays. */
  @IsOptional()
  @IsDateString()
  startDate?: string;
}
