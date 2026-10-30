import {
  Controller,
  Post,
  Body,
  UseGuards,
  Request,
  Get,
  Ip,
  Headers,
  HttpCode,
  Delete,
  Param,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { LoginDto, LogoutDto, RefreshDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ChangePasswordDto, ForgotPasswordDto, ResetPasswordDto } from './dto/password.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

@Controller('api/v1/auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async login(@Body() loginDto: LoginDto, @Ip() ip: string, @Headers('user-agent') userAgent: string) {
    return this.authService.login(loginDto, { ipAddress: ip, userAgent });
  }

  @Post('refresh')
  @HttpCode(200)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async refresh(@Body() body: RefreshDto) {
    return this.authService.refresh(body.refreshToken, body.sessionId);
  }

  @Post('register')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async register(@Body() registerDto: RegisterDto) {
    return this.authService.register(registerDto);
  }

  @Post('logout')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  async logout(@Body() body: LogoutDto, @Request() req) {
    return this.authService.logout(body.sessionId, req.user.id);
  }

  @Post('logout-all')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  async logoutAll(@Request() req) {
    return this.authService.logoutAll(req.user.id, req.user.organizationId);
  }

  @Get('sessions')
  @UseGuards(JwtAuthGuard)
  async sessions(@Request() req) {
    return this.authService.listSessions(req.user.id, req.user.sessionId);
  }

  /** Revokes one of the caller's own sessions (e.g. a lost device). */
  @Delete('sessions/:id')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  async revokeSession(@Param('id') id: string, @Request() req) {
    return this.authService.logout(id, req.user.id);
  }

  @Get('profile')
  @UseGuards(JwtAuthGuard)
  getProfile(@Request() req) {
    return req.user;
  }

  @Post('change-password')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  async changePassword(@Body() body: ChangePasswordDto, @Request() req) {
    return this.authService.changePassword(req.user.id, body.currentPassword, body.newPassword, req.user.sessionId);
  }

  @Post('forgot-password')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async forgotPassword(@Body() body: ForgotPasswordDto) {
    return this.authService.forgotPassword(body.email);
  }

  @Post('reset-password')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async resetPassword(@Body() body: ResetPasswordDto) {
    return this.authService.resetPassword(body.token, body.newPassword);
  }
}
