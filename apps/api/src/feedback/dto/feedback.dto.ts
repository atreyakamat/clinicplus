import { Transform } from 'class-transformer';
import { IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export const FEEDBACK_CATEGORIES = ['BUG', 'FEATURE', 'UX', 'OTHER'] as const;
export const FEEDBACK_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH'] as const;
export const FEEDBACK_STATUSES = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'] as const;

export class CreateFeedbackDto {
  @IsIn(FEEDBACK_CATEGORIES)
  category: (typeof FEEDBACK_CATEGORIES)[number];

  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  subject: string;

  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  content: string;

  @IsOptional()
  @IsIn(FEEDBACK_PRIORITIES)
  priority?: (typeof FEEDBACK_PRIORITIES)[number];
}

export class UpdateFeedbackStatusDto {
  @IsIn(FEEDBACK_STATUSES)
  status: (typeof FEEDBACK_STATUSES)[number];
}
