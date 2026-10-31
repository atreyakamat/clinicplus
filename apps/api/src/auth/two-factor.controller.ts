import { Body, Controller, Get, Headers, HttpCode, Ip, Post, Request, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { TwoFactorService } from './two-factor.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { DisableTwoFactorDto, EnableTwoFactorDto, VerifyTwoFactorDto } from './dto/two-factor.dto';

/**
 * Self-service staff two-factor authentication. Setup / enable / disable / status
 * act on the caller's OWN account (JwtAuthGuard only, no extra permission).
 * `verify` is guard-less by design: it completes a login that is not yet
 * authenticated, using a short-lived challenge token, and is rate limited.
 */
@Controller('api/v1/auth/2fa')
export class TwoFactorController {
  constructor(
    private readonly twoFactor: TwoFactorService,
    private readonly authService: AuthService,
  ) {}

  @Get('status')
  @UseGuards(JwtAuthGuard)
  status(@Request() req) {
    return this.twoFactor.status(req.user.id);
  }

  @Post('setup')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  setup(@Request() req) {
    return this.twoFactor.setup(req.user.id);
  }

  @Post('enable')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  enable(@Body() body: EnableTwoFactorDto, @Request() req) {
    return this.twoFactor.enable(req.user.id, body.code);
  }

  @Post('disable')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  disable(@Body() body: DisableTwoFactorDto, @Request() req) {
    return this.twoFactor.disable(req.user.id, { code: body.code, password: body.password });
  }

  @Post('verify')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  verify(@Body() body: VerifyTwoFactorDto, @Ip() ip: string, @Headers('user-agent') userAgent: string) {
    return this.authService.verifyTwoFactor(body.challengeToken, body.code, { ipAddress: ip, userAgent });
  }
}
