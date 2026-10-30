import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/services/audit.service';
import { MailService } from '../common/mail/mail.service';

jest.mock('bcryptjs', () => ({
  compare: jest.fn(),
  hash: jest.fn().mockResolvedValue('hashed'),
}));

const role = (name: string, perms: [string, string][]) => ({
  role: { name, rolePermissions: perms.map(([module, action]) => ({ permission: { module, action } })) },
});

describe('AuthService', () => {
  let service: AuthService;
  let usersService: { findByEmail: jest.Mock; findActiveById: jest.Mock };
  let prisma: any;
  let audit: { log: jest.Mock };
  let mail: { send: jest.Mock };

  const mockUser = {
    id: 'user-1',
    email: 'test@example.com',
    firstName: 'Test',
    lastName: 'User',
    passwordHash: 'hashed-password',
    organizationId: 'org-1',
    branchId: 'branch-1',
    roles: [role('Organization Owner', [['patients', 'view']])],
  };

  beforeEach(async () => {
    usersService = { findByEmail: jest.fn(), findActiveById: jest.fn() };
    prisma = {
      loginAttempt: { create: jest.fn(), count: jest.fn().mockResolvedValue(0) },
      userSession: { create: jest.fn().mockResolvedValue({ id: 'session-1' }), update: jest.fn(), updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
      user: { update: jest.fn(), findFirst: jest.fn() },
      passwordReset: { create: jest.fn(), updateMany: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
      $transaction: jest.fn().mockResolvedValue([]),
    };
    audit = { log: jest.fn() };
    mail = { send: jest.fn().mockResolvedValue({ delivered: false, provider: 'console' }) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: usersService },
        { provide: JwtService, useValue: { sign: jest.fn().mockReturnValue('mock-token') } },
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: { get: jest.fn((k: string) => (k === 'APP_BASE_URL' ? 'https://app.example.com' : undefined)) } },
        { provide: AuditService, useValue: audit },
        { provide: MailService, useValue: mail },
      ],
    }).compile();

    service = module.get(AuthService);
  });

  describe('validateUser', () => {
    it('returns the user when the password matches', async () => {
      usersService.findByEmail.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      const result = await service.validateUser('test@example.com', 'password');
      expect(result?.id).toBe('user-1');
    });

    it('returns null on password mismatch', async () => {
      usersService.findByEmail.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);
      expect(await service.validateUser('test@example.com', 'wrong')).toBeNull();
    });
  });

  describe('login', () => {
    it('returns tokens and a user with roles, permissions and orgWide', async () => {
      jest.spyOn(service, 'validateUser').mockResolvedValue(mockUser as any);
      const result = await service.login({ email: mockUser.email, password: 'password' });
      expect(result.accessToken).toBe('mock-token');
      expect(result.refreshToken).toMatch(/^[0-9a-f]{64}$/);
      expect(result.sessionId).toBe('session-1');
      expect(result.user).toMatchObject({ roles: ['Organization Owner'], permissions: ['patients.view'], orgWide: true });
      expect((result.user as any).passwordHash).toBeUndefined();
      expect(prisma.loginAttempt.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'SUCCESS' }) }),
      );
      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'LOGIN' }));
    });

    it('records a failed attempt and audits it for a known account', async () => {
      jest.spyOn(service, 'validateUser').mockResolvedValue(null);
      prisma.user.findFirst.mockResolvedValue({ id: 'user-1', organizationId: 'org-1' });
      await expect(service.login({ email: 'test@example.com', password: 'bad' })).rejects.toThrow(UnauthorizedException);
      expect(prisma.loginAttempt.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'FAILED' }) }),
      );
      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'LOGIN_FAILED', organizationId: 'org-1' }));
    });

    it('refuses login while locked out', async () => {
      prisma.loginAttempt.count.mockResolvedValue(99);
      await expect(service.login({ email: 'test@example.com', password: 'x' })).rejects.toThrow(/Too many failed/);
    });
  });

  describe('password reset', () => {
    it('stores only a hash of the token and e-mails a reset link', async () => {
      prisma.user.findFirst.mockResolvedValue(mockUser);
      await service.forgotPassword('test@example.com');
      const stored = prisma.passwordReset.create.mock.calls[0][0].data.token as string;
      const text = mail.send.mock.calls[0][0].text as string;
      const raw = /token=([0-9a-f]{64})/.exec(text)?.[1];
      expect(text).toContain('https://app.example.com/auth/reset-password?token=');
      expect(raw).toBeDefined();
      expect(stored).not.toBe(raw);
      expect(stored).toMatch(/^[0-9a-f]{64}$/);
    });

    it('responds identically for unknown e-mails', async () => {
      prisma.user.findFirst.mockResolvedValue(null);
      const res = await service.forgotPassword('nobody@example.com');
      expect(res.message).toMatch(/If the e-mail address is registered/);
      expect(mail.send).not.toHaveBeenCalled();
    });

    it('rejects malformed reset tokens', async () => {
      await expect(service.resetPassword('not-a-token', 'Password-123')).rejects.toThrow(BadRequestException);
    });
  });
});
