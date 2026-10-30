import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  HttpException,
  HttpStatus,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { compare, hash } from 'bcryptjs';
import { createHash, randomBytes } from 'crypto';
import { UsersService } from '../users/users.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { PrismaService } from '../prisma/prisma.service';
import { ensureOrganizationAccess } from './access.bootstrap';
import { extractPermissionNames, extractRoleNames } from './access.utils';
import { AuditService } from '../common/services/audit.service';
import { MailService } from '../common/mail/mail.service';
import { isUuid } from '../common/validation/uuid';
import { normalizeRoleName } from './access.utils';
import { ORG_WIDE_ROLE_NAMES } from './default-access';

const ORG_WIDE = new Set(ORG_WIDE_ROLE_NAMES.map(normalizeRoleName));
const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

const BCRYPT_ROUNDS = 12;

export interface AuthContext {
  ipAddress?: string;
  userAgent?: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private prisma: PrismaService,
    private config: ConfigService,
    private audit: AuditService,
    private mail: MailService,
  ) {}

  static async hashPassword(password: string) {
    return hash(password, BCRYPT_ROUNDS);
  }

  private publicUser(user: any) {
    const roles = extractRoleNames(user.roles ?? []);
    const permissions = extractPermissionNames(user.roles ?? []);
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      phone: user.phone ?? null,
      organizationId: user.organizationId,
      branchId: user.branchId,
      homeBranchId: user.branchId,
      roles,
      permissions,
      /** Owner / Clinic Admin / Super Admin: may view and switch across branches. */
      orgWide: roles.some((r) => ORG_WIDE.has(normalizeRoleName(r))),
    };
  }

  async validateUser(email: string, password: string) {
    const user = await this.usersService.findByEmail(email);
    if (user?.passwordHash && (await compare(password, user.passwordHash))) {
      return user;
    }
    return null;
  }

  private async assertNotLockedOut(email: string) {
    const max = this.config.get<number>('LOGIN_MAX_FAILED_ATTEMPTS') ?? 5;
    const minutes = this.config.get<number>('LOGIN_LOCKOUT_MINUTES') ?? 15;
    const since = new Date(Date.now() - minutes * 60_000);
    const failures = await this.prisma.loginAttempt.count({
      where: { email, status: 'FAILED', attemptTime: { gte: since } },
    });
    if (failures >= max) {
      throw new HttpException(
        `Too many failed login attempts. Try again in ${minutes} minutes.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  async login(loginDto: LoginDto, ctx: AuthContext = {}) {
    const email = loginDto.email.trim().toLowerCase();
    await this.assertNotLockedOut(email);

    const user = await this.validateUser(email, loginDto.password);
    if (!user) {
      await this.prisma.loginAttempt.create({
        data: { email, ipAddress: ctx.ipAddress, status: 'FAILED', failureReason: 'Invalid credentials' },
      });
      // Audit failures against a known account (unknown e-mails have no tenant to log into).
      const known = await this.prisma.user.findFirst({
        where: { email: { equals: email, mode: 'insensitive' } },
        select: { id: true, organizationId: true },
      });
      if (known) {
        await this.audit.log({
          organizationId: known.organizationId,
          userId: known.id,
          action: 'LOGIN_FAILED',
          resource: 'auth',
          resourceId: known.id,
          ipAddress: ctx.ipAddress,
          userAgent: ctx.userAgent,
        });
      }
      throw new UnauthorizedException('Invalid credentials');
    }

    const sessionTtlDays = this.config.get<number>('SESSION_TTL_DAYS') ?? 7;
    const refreshToken = randomBytes(32).toString('hex');
    const refreshTokenHash = await hash(refreshToken, 10);

    const session = await this.prisma.userSession.create({
      data: {
        userId: user.id,
        organizationId: user.organizationId,
        branchId: user.branchId,
        ipAddress: ctx.ipAddress,
        deviceName: ctx.userAgent?.slice(0, 200),
        refreshTokenHash,
        expiresAt: new Date(Date.now() + sessionTtlDays * 86_400_000),
      },
    });

    await Promise.all([
      this.prisma.loginAttempt.create({ data: { email, ipAddress: ctx.ipAddress, status: 'SUCCESS' } }),
      this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } }),
      this.audit.log({
        organizationId: user.organizationId,
        userId: user.id,
        action: 'LOGIN',
        resource: 'auth',
        resourceId: session.id,
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent,
      }),
    ]);

    return {
      accessToken: this.signAccessToken(user, session.id),
      refreshToken,
      sessionId: session.id,
      expiresIn: this.config.get<string>('JWT_ACCESS_TTL') ?? '1h',
      user: this.publicUser(user),
    };
  }

  private signAccessToken(user: { id: string; email: string; organizationId: string }, sessionId: string) {
    return this.jwtService.sign({
      sub: user.id,
      email: user.email,
      organizationId: user.organizationId,
      sid: sessionId,
    });
  }

  async refresh(refreshToken: string, sessionId: string) {
    if (!sessionId || !refreshToken || !isUuid(sessionId)) {
      throw new UnauthorizedException('Invalid refresh token or session');
    }
    const session = await this.prisma.userSession.findFirst({
      where: { id: sessionId, status: 'ACTIVE' },
    });
    if (!session || !session.refreshTokenHash) {
      throw new UnauthorizedException('Invalid refresh token or session');
    }
    if (session.expiresAt && session.expiresAt < new Date()) {
      await this.prisma.userSession.update({ where: { id: session.id }, data: { status: 'INACTIVE', logoutAt: new Date() } });
      throw new UnauthorizedException('Session expired');
    }
    if (!(await compare(refreshToken, session.refreshTokenHash))) {
      // Refresh-token reuse: revoke the session entirely.
      await this.prisma.userSession.update({ where: { id: session.id }, data: { status: 'INACTIVE', logoutAt: new Date() } });
      throw new UnauthorizedException('Invalid refresh token or session');
    }

    const user = await this.usersService.findActiveById(session.userId);
    if (!user) {
      throw new UnauthorizedException('User no longer active');
    }

    const newRefreshToken = randomBytes(32).toString('hex');
    await this.prisma.userSession.update({
      where: { id: session.id },
      data: { refreshTokenHash: await hash(newRefreshToken, 10) },
    });

    return {
      accessToken: this.signAccessToken(user, session.id),
      refreshToken: newRefreshToken,
      sessionId: session.id,
      user: this.publicUser(user),
    };
  }

  /** Ends one session; the session must belong to the caller. */
  async logout(sessionId: string, userId: string) {
    if (!isUuid(sessionId)) throw new BadRequestException('sessionId must be a valid UUID');
    const session = await this.prisma.userSession.findFirst({ where: { id: sessionId, userId } });
    if (!session) throw new UnauthorizedException('Session not found');
    if (session.status === 'ACTIVE') {
      await this.prisma.userSession.update({
        where: { id: session.id },
        data: { status: 'INACTIVE', logoutAt: new Date(), refreshTokenHash: null },
      });
      await this.audit.log({
        organizationId: session.organizationId,
        userId,
        action: 'LOGOUT',
        resource: 'auth',
        resourceId: session.id,
      });
    }
    return { message: 'Logged out' };
  }

  async logoutAll(userId: string, organizationId?: string) {
    const result = await this.prisma.userSession.updateMany({
      where: { userId, status: 'ACTIVE' },
      data: { status: 'INACTIVE', logoutAt: new Date(), refreshTokenHash: null },
    });
    if (organizationId) {
      await this.audit.log({ organizationId, userId, action: 'LOGOUT_ALL', resource: 'auth', resourceId: userId, afterData: { sessions: result.count } });
    }
    return { message: 'All sessions ended', count: result.count };
  }

  async listSessions(userId: string, currentSessionId?: string) {
    const sessions = await this.prisma.userSession.findMany({
      where: { userId, status: 'ACTIVE', OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
      select: { id: true, deviceName: true, ipAddress: true, loginAt: true, expiresAt: true, updatedAt: true },
      orderBy: { loginAt: 'desc' },
    });
    return sessions.map((s) => ({ ...s, current: s.id === currentSessionId }));
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string, keepSessionId?: string) {
    const user = await this.prisma.user.findFirst({ where: { id: userId, status: 'ACTIVE' } });
    if (!user?.passwordHash || !(await compare(currentPassword, user.passwordHash))) {
      throw new UnauthorizedException('Current password is incorrect');
    }
    if (await compare(newPassword, user.passwordHash)) {
      throw new BadRequestException('New password must differ from the current password');
    }
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: userId }, data: { passwordHash: await AuthService.hashPassword(newPassword) } }),
      this.prisma.userSession.updateMany({
        where: { userId, status: 'ACTIVE', ...(keepSessionId ? { id: { not: keepSessionId } } : {}) },
        data: { status: 'INACTIVE', logoutAt: new Date(), refreshTokenHash: null },
      }),
    ]);
    await this.audit.log({ organizationId: user.organizationId, userId, action: 'PASSWORD_CHANGED', resource: 'auth', resourceId: userId });
    return { message: 'Password updated' };
  }

  /**
   * Always responds identically so e-mail addresses cannot be enumerated.
   * Only a SHA-256 hash of the token is stored; the raw token travels in the
   * e-mailed link `${APP_BASE_URL}/auth/reset-password?token=...`.
   */
  async forgotPassword(email: string) {
    const user = await this.prisma.user.findFirst({
      where: { email: { equals: email.trim(), mode: 'insensitive' }, status: 'ACTIVE' },
    });
    if (user) {
      const token = randomBytes(32).toString('hex');
      // A new request supersedes any earlier unused link.
      await this.prisma.passwordReset.updateMany({
        where: { userId: user.id, usedAt: null },
        data: { usedAt: new Date() },
      });
      await this.prisma.passwordReset.create({
        data: { userId: user.id, token: sha256(token), expiresAt: new Date(Date.now() + 60 * 60_000) },
      });
      const base = (this.config.get<string>('APP_BASE_URL') ?? 'http://localhost:5173').replace(/\/+$/, '');
      const link = `${base}/auth/reset-password?token=${token}`;
      const delivery = await this.mail.send({
        to: user.email,
        subject: 'Reset your ClinicPlus password',
        text: `Hello ${user.firstName},\n\nSomeone (hopefully you) asked to reset your ClinicPlus password. Open this link within 1 hour to choose a new password:\n\n${link}\n\nIf you did not request this, you can ignore this message.`,
      });
      await this.audit.log({
        organizationId: user.organizationId,
        userId: user.id,
        action: 'PASSWORD_RESET_REQUESTED',
        resource: 'auth',
        resourceId: user.id,
        afterData: { emailDelivered: delivery.delivered },
      });
    }
    return { message: 'If the e-mail address is registered, a reset link has been issued.' };
  }

  async resetPassword(token: string, newPassword: string) {
    if (!/^[0-9a-f]{64}$/i.test(token)) {
      throw new BadRequestException('Reset token is invalid or has expired');
    }
    const reset = await this.prisma.passwordReset.findUnique({ where: { token: sha256(token.toLowerCase()) } });
    if (!reset || reset.usedAt || reset.expiresAt < new Date()) {
      throw new BadRequestException('Reset token is invalid or has expired');
    }
    const user = await this.prisma.user.findFirst({ where: { id: reset.userId, status: 'ACTIVE' } });
    if (!user) throw new BadRequestException('Reset token is invalid or has expired');
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: user.id }, data: { passwordHash: await AuthService.hashPassword(newPassword) } }),
      this.prisma.passwordReset.update({ where: { id: reset.id }, data: { usedAt: new Date() } }),
      this.prisma.userSession.updateMany({ where: { userId: user.id, status: 'ACTIVE' }, data: { status: 'INACTIVE', logoutAt: new Date(), refreshTokenHash: null } }),
    ]);
    await this.audit.log({ organizationId: user.organizationId, userId: user.id, action: 'PASSWORD_RESET', resource: 'auth', resourceId: user.id });
    return { message: 'Password has been reset. Please sign in.' };
  }

  async register(registerDto: RegisterDto) {
    const email = registerDto.email.trim().toLowerCase();
    const slug = registerDto.clinicSlug.trim().toLowerCase();

    // E-mail addresses are globally unique across organizations because login is by e-mail only.
    const existingUser = await this.prisma.user.findFirst({ where: { email } });
    if (existingUser) throw new ConflictException('Email already exists');

    const existingClinic = await this.prisma.organization.findUnique({ where: { slug } });
    if (existingClinic) throw new ConflictException('Clinic slug already exists');

    const passwordHash = await AuthService.hashPassword(registerDto.password);

    const result = await this.prisma.$transaction(async (tx) => {
      const org = await tx.organization.create({
        data: {
          name: registerDto.clinicName,
          slug,
          email,
          phone: registerDto.phone,
          subscriptionPlan: 'STARTER',
        },
      });
      const branch = await tx.branch.create({
        data: {
          organizationId: org.id,
          name: 'Main Branch',
          address: registerDto.address,
          city: registerDto.city,
          state: registerDto.state,
          country: registerDto.country ?? 'India',
          timezone: this.config.get<string>('DEFAULT_TIMEZONE') ?? 'Asia/Kolkata',
        },
      });
      const access = await ensureOrganizationAccess(tx, org.id, null);
      const user = await tx.user.create({
        data: {
          organizationId: org.id,
          branchId: branch.id,
          email,
          passwordHash,
          firstName: registerDto.firstName,
          lastName: registerDto.lastName,
          phone: registerDto.phone,
          specialization: registerDto.specialization,
        },
      });
      const ownerRole = access.rolesByName.get('Organization Owner');
      if (!ownerRole) throw new Error('Owner role bootstrap failed');
      await tx.userRole.create({
        data: { organizationId: org.id, branchId: branch.id, userId: user.id, roleId: ownerRole.id },
      });
      // Solo-practitioner clinics: the owner also sees patients, so they get the
      // Doctor role (the Owner role deliberately lacks clinical write access).
      if (registerDto.isPractitioner) {
        const doctorRole = access.rolesByName.get('Doctor');
        if (!doctorRole) throw new Error('Doctor role bootstrap failed');
        await tx.userRole.create({
          data: { organizationId: org.id, branchId: branch.id, userId: user.id, roleId: doctorRole.id },
        });
      }
      return { org, branch, user };
    });

    await this.audit.log({
      organizationId: result.org.id,
      userId: result.user.id,
      action: 'REGISTER',
      resource: 'organization',
      resourceId: result.org.id,
      afterData: { name: result.org.name, slug: result.org.slug, isPractitioner: !!registerDto.isPractitioner },
    });

    return {
      message: 'Clinic registered successfully',
      organizationId: result.org.id,
      branchId: result.branch.id,
      userId: result.user.id,
    };
  }
}
