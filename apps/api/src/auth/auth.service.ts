import { Injectable, UnauthorizedException, ConflictException } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { JwtService } from '@nestjs/jwt';
import { compare, hash } from 'bcryptjs';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private prisma: PrismaService,
  ) {}

  async validateUser(email: string, password: string): Promise<any> {
    const user = await this.usersService.findByEmail(email);
    if (user && user.passwordHash && (await compare(password, user.passwordHash))) {
      const { passwordHash, ...result } = user;
      return result;
    }
    return null;
  }

  async login(loginDto: LoginDto) {
    const user = await this.validateUser(loginDto.email, loginDto.password);
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }
    
    // Fetch roles
    const userRoles = await this.prisma.userRole.findMany({
      where: { userId: user.id },
      include: { role: { include: { rolePermissions: { include: { permission: true } } } } },
    });

    const roles = userRoles.map(ur => ur.role.name);
    const permissions = userRoles.flatMap(ur => ur.role.rolePermissions.map(rp => `${rp.permission.module}.${rp.permission.action}`));

    const payload = { 
      email: user.email, 
      sub: user.id, 
      organizationId: user.organizationId, 
      branchId: user.branchId,
      roles,
      permissions
    };
    return {
      accessToken: this.jwtService.sign(payload),
      user: {
        ...user,
        roles,
        permissions
      },
    };
  }

  async register(registerDto: RegisterDto) {
    const existingUser = await this.prisma.user.findFirst({
      where: { email: registerDto.email },
    });

    if (existingUser) {
      throw new ConflictException('Email already exists');
    }

    const existingClinic = await this.prisma.organization.findUnique({
      where: { slug: registerDto.clinicSlug },
    });

    if (existingClinic) {
      throw new ConflictException('Clinic slug already exists');
    }

    const passwordHash = await hash(registerDto.password, 10);

    return this.prisma.$transaction(async (tx) => {
      // 1. Create Organization
      const org = await tx.organization.create({
        data: {
          name: registerDto.clinicName,
          slug: registerDto.clinicSlug,
          email: registerDto.email,
          phone: registerDto.phone,
          subscriptionPlan: 'STARTER',
        },
      });

      // 2. Create Default Branch
      const branch = await tx.branch.create({
        data: {
          organizationId: org.id,
          name: 'Main Branch',
          address: registerDto.address,
          city: registerDto.city,
          state: registerDto.state,
          country: registerDto.country,
        },
      });

      // 3. Create Owner User
      const user = await tx.user.create({
        data: {
          organizationId: org.id,
          branchId: branch.id,
          email: registerDto.email,
          passwordHash,
          firstName: registerDto.firstName,
          lastName: registerDto.lastName,
          phone: registerDto.phone,
        },
      });

      return {
        message: 'Clinic registered successfully',
        organizationId: org.id,
        userId: user.id,
      };
    });
  }
}
