import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { compare } from 'bcryptjs';
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/services/audit.service';

// otplib ships as ESM-only; load it (and qrcode) lazily via require so that
// modules importing this service (e.g. AuthService) do not eagerly pull the ESM
// build into CommonJS unit-test runtimes that never exercise 2FA.
type OtpLib = typeof import('otplib');
type QrLib = typeof import('qrcode');
let otpCache: OtpLib | undefined;
let qrCache: QrLib | undefined;
const otp = (): OtpLib => (otpCache ??= require('otplib'));
const qr = (): QrLib => (qrCache ??= require('qrcode'));

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

/** One period (30s) of clock-skew tolerance each way when verifying a TOTP code. */
const TOTP_EPOCH_TOLERANCE = 30;
const RECOVERY_CODE_COUNT = 10;
const CHALLENGE_TTL_MS = 5 * 60_000;
const ISSUER = 'ClinicPlus';

export interface TwoFactorSetup {
  secret: string;
  otpauthUrl: string;
  qrDataUrl: string;
}

/**
 * Staff TOTP two-factor authentication: enrolment, enable/disable, login
 * challenge tokens and code verification. Recovery codes and the login
 * challenge are self-contained here, so AuthService depends on this service
 * one-way (no circular reference).
 */
@Injectable()
export class TwoFactorService {
  private readonly logger = new Logger(TwoFactorService.name);
  private readonly challengeKey: Buffer;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
  ) {
    // Derive a key distinct from the JWT signing secret so a challenge token can
    // never be replayed as a bearer access token (the JWT strategy uses JWT_SECRET).
    const base = this.config.getOrThrow<string>('JWT_SECRET');
    this.challengeKey = createHash('sha256').update(`${base}:2fa-challenge`).digest();
  }

  // ----------------------------------------------------------- login challenge

  /** Short-lived, HMAC-signed token bound to a user; NOT a JWT access token. */
  createChallengeToken(userId: string): string {
    const payload = Buffer.from(JSON.stringify({ uid: userId, exp: Date.now() + CHALLENGE_TTL_MS })).toString('base64url');
    const sig = createHmac('sha256', this.challengeKey).update(payload).digest('base64url');
    return `${payload}.${sig}`;
  }

  /** Returns the bound userId, or throws if the token is malformed, forged or expired. */
  verifyChallengeToken(token: string): string {
    const err = () => new UnauthorizedException('Two-factor challenge is invalid or has expired');
    const [payload, sig] = (token ?? '').split('.');
    if (!payload || !sig) throw err();
    const expected = createHmac('sha256', this.challengeKey).update(payload).digest();
    let provided: Buffer;
    try {
      provided = Buffer.from(sig, 'base64url');
    } catch {
      throw err();
    }
    if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) throw err();
    let data: { uid?: string; exp?: number };
    try {
      data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    } catch {
      throw err();
    }
    if (!data?.uid || typeof data.exp !== 'number' || data.exp < Date.now()) throw err();
    return data.uid;
  }

  // ------------------------------------------------------------- TOTP helpers

  verifyTotp(secret: string | null | undefined, code: string): boolean {
    if (!secret || !/^[0-9]{6}$/.test(code)) return false;
    try {
      return otp().verifySync({ secret, token: code, epochTolerance: TOTP_EPOCH_TOLERANCE }).valid === true;
    } catch {
      return false;
    }
  }

  // ------------------------------------------------------------ enrol / enable

  /** Generates and provisionally stores a secret; 2FA stays disabled until enable(). */
  async setup(userId: string): Promise<TwoFactorSetup> {
    const user = await this.prisma.user.findFirst({ where: { id: userId, status: 'ACTIVE' } });
    if (!user) throw new UnauthorizedException();
    if (user.twoFactorEnabled) {
      throw new ConflictException('Two-factor authentication is already enabled. Disable it first to re-enrol.');
    }
    const secret = otp().generateSecret();
    await this.prisma.user.update({ where: { id: userId }, data: { twoFactorSecret: secret } });
    const otpauthUrl = otp().generateURI({ issuer: ISSUER, label: user.email, secret });
    const qrDataUrl = await qr().toDataURL(otpauthUrl);
    return { secret, otpauthUrl, qrDataUrl };
  }

  /** Verifies the provisional secret with a code, enables 2FA and returns recovery codes ONCE. */
  async enable(userId: string, code: string): Promise<{ recoveryCodes: string[] }> {
    const user = await this.prisma.user.findFirst({ where: { id: userId, status: 'ACTIVE' } });
    if (!user) throw new UnauthorizedException();
    if (user.twoFactorEnabled) throw new ConflictException('Two-factor authentication is already enabled');
    if (!user.twoFactorSecret) throw new BadRequestException('Start setup first (POST /auth/2fa/setup)');
    if (!this.verifyTotp(user.twoFactorSecret, code)) {
      throw new UnauthorizedException('That code is incorrect. Check your authenticator app and try again.');
    }
    const recoveryCodes = Array.from({ length: RECOVERY_CODE_COUNT }, () => this.generateRecoveryCode());
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        twoFactorEnabled: true,
        twoFactorRecoveryCodes: recoveryCodes.map((c) => sha256(this.normalizeRecoveryCode(c))),
      },
    });
    await this.audit.log({
      organizationId: user.organizationId,
      userId,
      action: 'TWO_FACTOR_ENABLED',
      resource: 'auth',
      resourceId: userId,
    });
    return { recoveryCodes };
  }

  async disable(userId: string, opts: { code?: string; password?: string }): Promise<{ message: string }> {
    const user = await this.prisma.user.findFirst({ where: { id: userId, status: 'ACTIVE' } });
    if (!user) throw new UnauthorizedException();
    if (!user.twoFactorEnabled) throw new BadRequestException('Two-factor authentication is not enabled');
    if (!opts.code && !opts.password) {
      throw new BadRequestException('Provide your current authenticator code or your password to disable 2FA');
    }
    const codeOk = opts.code ? this.verifyTotp(user.twoFactorSecret, opts.code) : false;
    const passwordOk = opts.password && user.passwordHash ? await compare(opts.password, user.passwordHash) : false;
    if (!codeOk && !passwordOk) {
      throw new UnauthorizedException('Could not verify your identity. Check the code or password and try again.');
    }
    await this.prisma.user.update({
      where: { id: userId },
      data: { twoFactorEnabled: false, twoFactorSecret: null, twoFactorRecoveryCodes: Prisma.JsonNull },
    });
    await this.audit.log({
      organizationId: user.organizationId,
      userId,
      action: 'TWO_FACTOR_DISABLED',
      resource: 'auth',
      resourceId: userId,
    });
    return { message: 'Two-factor authentication disabled' };
  }

  async status(userId: string): Promise<{ enabled: boolean; recoveryCodesRemaining: number }> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, status: 'ACTIVE' },
      select: { twoFactorEnabled: true, twoFactorRecoveryCodes: true },
    });
    const codes = Array.isArray(user?.twoFactorRecoveryCodes) ? (user!.twoFactorRecoveryCodes as unknown[]) : [];
    return { enabled: !!user?.twoFactorEnabled, recoveryCodesRemaining: user?.twoFactorEnabled ? codes.length : 0 };
  }

  // --------------------------------------------------------------- recovery codes

  /**
   * Consumes a recovery code: if the code matches an unused hash it is removed
   * (single use) and true is returned. Persisted atomically.
   */
  async consumeRecoveryCode(user: { id: string; twoFactorRecoveryCodes: unknown }, code: string): Promise<boolean> {
    const hashes = Array.isArray(user.twoFactorRecoveryCodes) ? (user.twoFactorRecoveryCodes as string[]) : [];
    if (!hashes.length) return false;
    const target = sha256(this.normalizeRecoveryCode(code));
    const idx = hashes.findIndex((h) => typeof h === 'string' && h.length === target.length && safeEqualHex(h, target));
    if (idx === -1) return false;
    const remaining = hashes.filter((_, i) => i !== idx);
    await this.prisma.user.update({ where: { id: user.id }, data: { twoFactorRecoveryCodes: remaining } });
    return true;
  }

  private generateRecoveryCode(): string {
    // 10 lowercase hex chars grouped as xxxxx-xxxxx (~40 bits of entropy).
    const raw = randomBytes(5).toString('hex');
    return `${raw.slice(0, 5)}-${raw.slice(5, 10)}`;
  }

  private normalizeRecoveryCode(code: string): string {
    return code.replace(/[\s-]/g, '').toLowerCase();
  }
}

/** Timing-safe comparison of two equal-length hex strings. */
function safeEqualHex(a: string, b: string): boolean {
  try {
    return timingSafeEqual(Buffer.from(a), Buffer.from(b));
  } catch {
    return false;
  }
}
