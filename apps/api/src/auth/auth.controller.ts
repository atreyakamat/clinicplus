import { Controller, Post, Body, UseGuards, Request, Get, Ip, Headers } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

@Controller('api/v1/auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  async login(
    @Body() loginDto: LoginDto, 
    @Ip() ip: string, 
    @Headers('user-agent') userAgent: string
  ) {
    return this.authService.login(loginDto, ip, userAgent);
  }

  @Post('refresh')
  async refresh(@Body() body: { refreshToken: string; sessionId: string }) {
    return this.authService.refresh(body.refreshToken, body.sessionId);
  }

  @Post('register')
  async register(@Body() registerDto: RegisterDto) {
    return this.authService.register(registerDto);
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  async logout(@Body() body: { sessionId: string }) {
    return this.authService.logout(body.sessionId);
  }

  @Get('profile')
  @UseGuards(JwtAuthGuard)
  getProfile(@Request() req) {
    return req.user;
  }
}
