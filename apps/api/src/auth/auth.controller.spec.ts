import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { ThrottlerGuard } from '@nestjs/throttler';

describe('AuthController', () => {
  let controller: AuthController;
  let authService: AuthService;

  const mockAuthService = {
    login: jest.fn().mockResolvedValue({
      accessToken: 'test_token',
      user: { id: '1', email: 'test@clinicos.com', roles: [] },
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: mockAuthService,
        },
      ],
    })
      .overrideGuard(ThrottlerGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<AuthController>(AuthController);
    authService = module.get<AuthService>(AuthService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('login', () => {
    it('should return a user and access token', async () => {
      const loginDto = { email: 'test@clinicos.com', password: 'password' };
      const ip = '127.0.0.1';
      const userAgent = 'Mozilla/5.0';

      const result = await controller.login(loginDto, ip, userAgent);

      expect(result).toEqual({
        accessToken: 'test_token',
        user: { id: '1', email: 'test@clinicos.com', roles: [] },
      });
      expect(authService.login).toHaveBeenCalledWith(loginDto, ip, userAgent);
    });
  });
});
