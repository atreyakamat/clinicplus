import { Test, TestingModule } from '@nestjs/testing';
import { ThrottlerGuard } from '@nestjs/throttler';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

describe('AuthController', () => {
  let controller: AuthController;
  const mockAuthService = {
    login: jest.fn().mockResolvedValue({
      accessToken: 'test_token',
      refreshToken: 'refresh',
      sessionId: 'sid',
      user: { id: '1', email: 'test@clinicos.com', roles: [], permissions: [], orgWide: false },
    }),
    refresh: jest.fn().mockResolvedValue({ accessToken: 'new' }),
    logout: jest.fn().mockResolvedValue({ message: 'Logged out' }),
    logoutAll: jest.fn().mockResolvedValue({ message: 'All sessions ended', count: 2 }),
    listSessions: jest.fn().mockResolvedValue([]),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: mockAuthService }],
    })
      .overrideGuard(ThrottlerGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = module.get<AuthController>(AuthController);
  });

  it('passes credentials and request context to the service', async () => {
    const dto = { email: 'test@clinicos.com', password: 'password' };
    const result = await controller.login(dto, '127.0.0.1', 'Mozilla/5.0');
    expect(result.accessToken).toBe('test_token');
    expect(mockAuthService.login).toHaveBeenCalledWith(dto, { ipAddress: '127.0.0.1', userAgent: 'Mozilla/5.0' });
  });

  it('refresh uses the refresh token + session id contract', async () => {
    await controller.refresh({ refreshToken: 'r', sessionId: 's' });
    expect(mockAuthService.refresh).toHaveBeenCalledWith('r', 's');
  });

  it('logout-all is scoped to the caller and audited with the organization', async () => {
    await controller.logoutAll({ user: { id: 'u1', organizationId: 'o1' } });
    expect(mockAuthService.logoutAll).toHaveBeenCalledWith('u1', 'o1');
  });

  it('sessions marks the current session', async () => {
    await controller.sessions({ user: { id: 'u1', sessionId: 's1' } });
    expect(mockAuthService.listSessions).toHaveBeenCalledWith('u1', 's1');
  });

  it('revoking a session only targets the caller', async () => {
    await controller.revokeSession('s2', { user: { id: 'u1' } });
    expect(mockAuthService.logout).toHaveBeenCalledWith('s2', 'u1');
  });
});
