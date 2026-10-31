import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const PERMISSION_KEY = /^[a-z_]+[.:][a-z_]+$/i;

export class CreateRoleDto {
  @Transform(trim) @IsString() @IsNotEmpty() @MinLength(2) @MaxLength(60)
  name: string;

  @Transform(trim) @IsOptional() @IsString() @MaxLength(300)
  description?: string;

  /** Permission keys (`module.action`). */
  @IsArray() @ArrayUnique() @ArrayMaxSize(300)
  @IsString({ each: true }) @Matches(PERMISSION_KEY, { each: true, message: 'each permission must look like module.action' })
  permissions: string[];
}

export class UpdateRoleDto {
  @Transform(trim) @IsOptional() @IsString() @IsNotEmpty() @MinLength(2) @MaxLength(60)
  name?: string;

  @Transform(trim) @IsOptional() @IsString() @MaxLength(300)
  description?: string;

  @IsOptional() @IsArray() @ArrayUnique() @ArrayMaxSize(300)
  @IsString({ each: true }) @Matches(PERMISSION_KEY, { each: true, message: 'each permission must look like module.action' })
  permissions?: string[];
}
