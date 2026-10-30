import { HttpException, HttpStatus, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { compare, hash } from 'bcryptjs';
import { createHash, randomBytes, randomInt } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/services/audit.service';
import { SmsService } from '../messages/sms.service';
import {
  PORTAL_ACCESS_TTL,
  PORTAL_OTP_LENGTH,
  PORTAL_OTP_MAX_ATTEMPTS,
  PORTAL_OTP_PURPOSE_LOGIN,
  PORTAL_OTP_TTL_MINUTES,
  PORTAL_REFRESH_TTL_DAYS,
  PORTAL_TOKEN_TYPE,
} from './portal.constants';
import { PortalLoginDto, PortalOtpRequestDto, PortalOtpVerifyDto } from './dto/portal-auth.dto';

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
const BCRYPT_ROUNDS = 12;

/** Identical generic message so callers cannot enumerate accounts. */
const GENERIC_SENT = { message: 'If the details match an enabled account, a login code has been sent.' };

export interface PortalAuthContext {
  ipAddress?: string;
  userAgent?: string;
}

type PatientRow = {
  id: string;
  organizationId: string;
  branchId: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  email: string | null;
  preferredChannel: string | null;
  portalPasswordHash: string | null;
};

const PATIENT_SELECT = {
  id: true,
  organizationId: true,
  branchId: true,
  firstName: true,
  lastName: true,
  phone: true,
  email: true,
  preferredChannel: true,
  portalPasswordHash: true,
} as const;

const ORG_SELECT = { id: true, name: true, slug: true, status: true, primaryColor: true, logoUrl: true } as const;

@Injectable()
export class PortalAuthService {
  private readonly logger = new Logger(PortalAuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
    private readonly sms: SmsService,
  ) {}

  // ------------------------------------------------------------------ helpers

  private digits(value: string) {
    return value.replace(/\D+/g, '');
  }

  /** Enabled, active patients in the clinic that match the phone/e-mail. */
  private async findCandidates(organizationId: string, identifier: string): Promise<PatientRow[]> {
    const id = identifier.trim();
    if (id.includes('@')) {
      return this.prisma.patient.findMany({
        where: {
          organizationId,
          email: { equals: id.toLowerCase(), mode: 'insensitive' },
          portalEnabled: true,
          status: 'ACTIVE',
        },
        select: PATIENT_SELECT,
        orderBy: { createdAt: 'asc' },
        take: 10,
      });
    }
    const d = this.digits(id);
    if (d.length < 6) return [];
    return this.prisma.patient.findMany({
      where: { organizationId, phone: { contains: d }, portalEnabled: true, status: 'ACTIVE' },
      select: PATIENT_SELECT,
      orderBy: { createdAt: 'asc' },
      take: 10,
    });
  }

  private async org(slug: string) {
    const org = await this.prisma.organization.findUnique({ where: { slug }, select: ORG_SELECT });
    return org && org.status === 'ACTIVE' ? org : null;
  }

  private lockoutKey(scope: string, clinicSlug: string, identifier: string) {
    return `portal:${scope}:${clinicSlug.trim().toLowerCase()}:${identifier.trim().toLowerCase()}`;
  }

  private async assertNotLockedOut(key: string) {
    const max = this.config.get<number>('LOGIN_MAX_FAILED_ATTEMPTS') ?? 5;
    const minutes = this.config.get<number>('LOGIN_LOCKOUT_MINUTES') ?? 15;
    const since = new Date(Date.now() - minutes * 60_000);
    const failures = await this.prisma.loginAttempt.count({
      where: { email: key, status: 'FAILED', attemptTime: { gte: since } },
    });
    if (failures >= max) {
      throw new HttpException(
        `Too many failed attempts. Try again in ${minutes} minutes.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private async recordAttempt(key: string, status: 'SUCCESS' | 'FAILED', ctx: PortalAuthContext, reason?: string) {
    await this.prisma.loginAttempt.create({
      data: { email: key, ipAddress: ctx.ipAddress, status, failureReason: reason ?? null },
    });
  }

  private publicPatient(p: PatientRow, org: { id: string; name: string; slug: string; primaryColor: string | null; logoUrl: string | null }) {
    return {
      id: p.id,
      firstName: p.firstName,
      lastName: p.lastName,
      phone: p.phone,
      email: p.email,
      preferredChannel: p.preferredChannel,
      organizationId: p.organizationId,
      organization: { id: org.id, name: org.name, slug: org.slug, primaryColor: org.primaryColor, logoUrl: org.logoUrl },
    };
  }

  /** Creates a hashed-refresh session and mints an access token for it. */
  private async issueSession(
    p: PatientRow,
    org: { id: string; name: string; slug: string; primaryColor: string | null; logoUrl: string | null },
    ctx: PortalAuthContext,
  ) {
    const refreshToken = randomBytes(32).toString('hex');
    const session = await this.prisma.patientPortalSession.create({
      data: {
        organizationId: p.organizationId,
        patientId: p.id,
        tokenHash: sha256(refreshToken),
        userAgent: ctx.userAgent?.slice(0, 300) ?? null,
        ipAddress: ctx.ipAddress ?? null,
        expiresAt: new Date(Date.now() + PORTAL_REFRESH_TTL_DAYS * 86_400_000),
      },
    });
    const accessToken = this.jwt.sign(
      { typ: PORTAL_TOKEN_TYPE, patientId: p.id, organizationId: p.organizationId, branchId: p.branchId, sid: session.id },
      { expiresIn: PORTAL_ACCESS_TTL },
    );
    await this.prisma.patient.update({ where: { id: p.id }, data: { portalLastLoginAt: new Date() } });
    await this.audit.log({
      organizationId: p.organizationId,
      action: 'PORTAL_LOGIN',
      resource: 'patient_portal',
      resourceId: p.id,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });
    return {
      accessToken,
      refreshToken,
      expiresIn: PORTAL_ACCESS_TTL,
      patient: this.publicPatient(p, org),
    };
  }

  // ------------------------------------------------------------------ password login

  async login(dto: PortalLoginDto, ctx: PortalAuthContext) {
    const key = this.lockoutKey('pwd', dto.clinicSlug, dto.identifier);
    await this.assertNotLockedOut(key);

    const org = await this.org(dto.clinicSlug);
    const candidates = org ? await this.findCandidates(org.id, dto.identifier) : [];
    let matched: PatientRow | null = null;
    for (const c of candidates) {
      if (c.portalPasswordHash && (await compare(dto.password, c.portalPasswordHash))) {
        matched = c;
        break;
      }
    }
    if (!matched || !org) {
      await this.recordAttempt(key, 'FAILED', ctx, 'Invalid credentials');
      throw new UnauthorizedException('Invalid credentials');
    }
    await this.recordAttempt(key, 'SUCCESS', ctx);
    return this.issueSession(matched, org, ctx);
  }

  // ------------------------------------------------------------------ OTP login

  async requestOtp(dto: PortalOtpRequestDto, ctx: PortalAuthContext) {
    const org = await this.org(dto.clinicSlug);
    const candidate = org ? (await this.findCandidates(org.id, dto.identifier))[0] : undefined;
    if (org && candidate) {
      const code = String(randomInt(0, 10 ** PORTAL_OTP_LENGTH)).padStart(PORTAL_OTP_LENGTH, '0');
      // Supersede any earlier un-consumed login codes.
      await this.prisma.patientPortalOtp.updateMany({
        where: { patientId: candidate.id, purpose: PORTAL_OTP_PURPOSE_LOGIN, consumedAt: null },
        data: { consumedAt: new Date() },
      });
      await this.prisma.patientPortalOtp.create({
        data: {
          organizationId: org.id,
          patientId: candidate.id,
          codeHash: sha256(code),
          purpose: PORTAL_OTP_PURPOSE_LOGIN,
          expiresAt: new Date(Date.now() + PORTAL_OTP_TTL_MINUTES * 60_000),
        },
      });
      try {
        await this.sms.sendAndRecord(
          candidate.id,
          `${org.name}: your patient portal login code is ${code}. It expires in ${PORTAL_OTP_TTL_MINUTES} minutes.`,
          org.id,
          candidate.branchId,
        );
      } catch (err: any) {
        // Delivery failures (no phone / opted out / console driver) must not reveal whether the account exists.
        this.logger.warn(`Portal OTP delivery skipped for patient ${candidate.id}: ${err?.message ?? err}`);
      }
      await this.audit.log({
        organizationId: org.id,
        action: 'PORTAL_OTP_REQUESTED',
        resource: 'patient_portal',
        resourceId: candidate.id,
        ipAddress: ctx.ipAddress,
      });
    }
    return GENERIC_SENT;
  }

  async verifyOtp(dto: PortalOtpVerifyDto, ctx: PortalAuthContext) {
    const key = this.lockoutKey('otp', dto.clinicSlug, dto.identifier);
    await this.assertNotLockedOut(key);

    const org = await this.org(dto.clinicSlug);
    const candidate = org ? (await this.findCandidates(org.id, dto.identifier))[0] : undefined;
    const fail = async () => {
      await this.recordAttempt(key, 'FAILED', ctx, 'Invalid OTP');
      throw new UnauthorizedException('Invalid or expired code');
    };
    if (!org || !candidate) return fail();

    const otp = await this.prisma.patientPortalOtp.findFirst({
      where: {
        patientId: candidate.id,
        purpose: PORTAL_OTP_PURPOSE_LOGIN,
        consumedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (!otp) return fail();

    if (otp.attempts >= PORTAL_OTP_MAX_ATTEMPTS) {
      await this.prisma.patientPortalOtp.update({ where: { id: otp.id }, data: { consumedAt: new Date() } });
      return fail();
    }
    if (otp.codeHash !== sha256(dto.code.trim())) {
      await this.prisma.patientPortalOtp.update({ where: { id: otp.id }, data: { attempts: { increment: 1 } } });
      return fail();
    }

    await this.prisma.patientPortalOtp.update({ where: { id: otp.id }, data: { consumedAt: new Date() } });
    await this.recordAttempt(key, 'SUCCESS', ctx);
    return this.issueSession(candidate, org, ctx);
  }

  // ------------------------------------------------------------------ refresh / logout

  async refresh(refreshToken: string, ctx: PortalAuthContext) {
    const tokenHash = sha256(refreshToken);
    const session = await this.prisma.patientPortalSession.findFirst({
      where: { tokenHash, revokedAt: null, expiresAt: { gt: new Date() } },
    });
    if (!session) throw new UnauthorizedException('Invalid or expired session');

    const patient = await this.prisma.patient.findFirst({
      where: { id: session.patientId, organizationId: session.organizationId, portalEnabled: true, status: 'ACTIVE' },
      select: PATIENT_SELECT,
    });
    const org = patient
      ? await this.prisma.organization.findUnique({ where: { id: patient.organizationId }, select: ORG_SELECT })
      : null;
    if (!patient || !org || org.status !== 'ACTIVE') {
      await this.prisma.patientPortalSession.update({ where: { id: session.id }, data: { revokedAt: new Date() } });
      throw new UnauthorizedException('Invalid or expired session');
    }

    // Rotate the refresh token (single use) and mint a fresh access token for the same session.
    const newRefresh = randomBytes(32).toString('hex');
    await this.prisma.patientPortalSession.update({
      where: { id: session.id },
      data: { tokenHash: sha256(newRefresh), ...(ctx.ipAddress ? { ipAddress: ctx.ipAddress } : {}) },
    });
    const accessToken = this.jwt.sign(
      { typ: PORTAL_TOKEN_TYPE, patientId: patient.id, organizationId: patient.organizationId, branchId: patient.branchId, sid: session.id },
      { expiresIn: PORTAL_ACCESS_TTL },
    );
    return { accessToken, refreshToken: newRefresh, expiresIn: PORTAL_ACCESS_TTL, patient: this.publicPatient(patient, org) };
  }

  /** Revokes the session that owns the refresh token. Idempotent and never reveals validity. */
  async logout(refreshToken: string) {
    const session = await this.prisma.patientPortalSession.findFirst({
      where: { tokenHash: sha256(refreshToken), revokedAt: null },
    });
    if (session) {
      await this.prisma.patientPortalSession.update({ where: { id: session.id }, data: { revokedAt: new Date() } });
      await this.audit.log({
        organizationId: session.organizationId,
        action: 'PORTAL_LOGOUT',
        resource: 'patient_portal',
        resourceId: session.patientId,
      });
    }
    return { message: 'Logged out' };
  }

  // ------------------------------------------------------------------ staff enablement helpers

  static async hashPassword(password: string) {
    return hash(password, BCRYPT_ROUNDS);
  }
}
