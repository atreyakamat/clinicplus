import { Transform } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, ArrayUnique, IsArray, IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class SetRolesDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(10) @ArrayUnique() @IsUUID('all', { each: true })
  roleIds: string[];
}

export class MoveBranchDto {
  @IsUUID()
  branchId: string;
}

export class ListUsersQueryDto {
  @IsOptional() @IsString() @MaxLength(60)
  role?: string;

  /** ACTIVE (default), INACTIVE or ALL. */
  @IsOptional() @Transform(({ value }) => (typeof value === 'string' ? value.toUpperCase() : value))
  @IsIn(['ACTIVE', 'INACTIVE', 'ALL'])
  status?: 'ACTIVE' | 'INACTIVE' | 'ALL';

  /** Org-wide users only: 'true' lists every branch. */
  @IsOptional() @IsIn(['true', 'false'])
  allBranches?: string;

  @IsOptional() @IsString() @MaxLength(100)
  search?: string;
}
