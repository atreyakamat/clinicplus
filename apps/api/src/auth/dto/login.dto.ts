import { Transform } from 'class-transformer';
import { IsEmail, IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class LoginDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail()
  @IsNotEmpty()
  @MaxLength(254)
  email: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  password: string;
}

export class RefreshDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  refreshToken: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  sessionId: string;
}

export class LogoutDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  sessionId: string;
}
