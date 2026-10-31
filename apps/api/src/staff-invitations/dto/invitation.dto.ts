import { Transform } from 'class-transformer';
import { IsEmail, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { IsStrongPassword } from '../../common/validation/password';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class InviteStaffDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail()
  @IsNotEmpty()
  @MaxLength(254)
  email: string;

  @Transform(trim) @IsOptional() @IsString() @MaxLength(20)
  phone?: string;

  @IsUUID()
  roleId: string;

  @IsOptional() @IsUUID()
  branchId?: string;
}

export class AcceptInvitationDto {
  @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(80)
  firstName: string;

  @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(80)
  lastName: string;

  @IsString() @IsNotEmpty() @IsStrongPassword()
  password: string;

  @Transform(trim) @IsOptional() @IsString() @MaxLength(20)
  phone?: string;
}
