import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

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
    }).compile();

    controller = module.get<AuthController>(AuthController);
    authService = module.get<AuthService>(AuthService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('login', () => {
    it('should return a user and access token', async () => {
      const loginDto = { email: 'test@clinicos.com', password: 'password' };
      const req = { user: { id: '1', email: 'test@clinicos.com', roles: [] } };
      
      const result = await controller.login(loginDto, req);
      
      expect(result).toEqual({
        accessToken: 'test_token',
        user: { id: '1', email: 'test@clinicos.com', roles: [] },
      });
      expect(authService.login).toHaveBeenCalledWith(loginDto);
    });
  });
});
