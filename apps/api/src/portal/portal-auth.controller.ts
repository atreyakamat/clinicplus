import { Body, Controller, Headers, HttpCode, Ip, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { PortalAuthService } from './portal-auth.service';
import {
  PortalLoginDto,
  PortalLogoutDto,
  PortalOtpRequestDto,
  PortalOtpVerifyDto,
  PortalRefreshDto,
} from './dto/portal-auth.dto';

/**
 * Public (no login) patient portal authentication. Guard-less by design and
 * tightly throttled. Tokens issued here are patient tokens (`typ: 'patient'`)
 * which the staff JwtStrategy rejects; they only satisfy the PortalAuthGuard.
 */
@Controller('api/v1/portal/auth')
@Throttle({ default: { limit: 20, ttl: 60_000 } })
export class PortalAuthController {
  constructor(private readonly auth: PortalAuthService) {}

  @Post('login')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  login(@Body() dto: PortalLoginDto, @Ip() ip: string, @Headers('user-agent') userAgent: string) {
    return this.auth.login(dto, { ipAddress: ip, userAgent });
  }

  @Post('otp/request')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  requestOtp(@Body() dto: PortalOtpRequestDto, @Ip() ip: string) {
    return this.auth.requestOtp(dto, { ipAddress: ip });
  }

  @Post('otp/verify')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  verifyOtp(@Body() dto: PortalOtpVerifyDto, @Ip() ip: string, @Headers('user-agent') userAgent: string) {
    return this.auth.verifyOtp(dto, { ipAddress: ip, userAgent });
  }

  @Post('refresh')
  @HttpCode(200)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  refresh(@Body() dto: PortalRefreshDto, @Ip() ip: string) {
    return this.auth.refresh(dto.refreshToken, { ipAddress: ip });
  }

  @Post('logout')
  @HttpCode(200)
  logout(@Body() dto: PortalLogoutDto) {
    return this.auth.logout(dto.refreshToken);
  }
}
