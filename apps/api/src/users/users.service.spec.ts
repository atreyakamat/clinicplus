import { Test, TestingModule } from '@nestjs/testing';
import { UsersService } from './users.service';
import { PrismaService } from '../prisma/prisma.service';

describe('UsersService', () => {
  let service: UsersService;
  let prisma: PrismaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: PrismaService,
          useValue: {
            user: {
              findUnique: jest.fn(),
              findMany: jest.fn(),
              findFirst: jest.fn(),
              create: jest.fn(),
            },
          },
        },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findByEmail', () => {
    it('should return a user if email exists', async () => {
      const mockUser = { id: '1', email: 'test@test.com' };
      jest.spyOn(prisma.user, 'findFirst').mockResolvedValue(mockUser as any);

      const result = await service.findByEmail('test@test.com');
      expect(result).toEqual(mockUser);
    });
  });

  describe('findAll', () => {
    it('should return all users for an organization', async () => {
      const mockUsers = [{ id: '1' }, { id: '2' }];
      jest.spyOn(prisma.user, 'findMany').mockResolvedValue(mockUsers as any);

      const result = await service.findAll('org-1');
      expect(result).toEqual(mockUsers);
      expect(prisma.user.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({ organizationId: 'org-1' })
      }));
    });
  });
});
