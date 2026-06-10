import {
  Injectable,
  UnauthorizedException,
  ConflictException,
} from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { JwtService } from '@nestjs/jwt';
import { compare, hash } from 'bcryptjs';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { PrismaService } from '../prisma/prisma.service';
import { randomUUID } from 'crypto';
import { ensureOrganizationAccess } from './access.bootstrap';
import { extractPermissionNames, extractRoleNames } from './access.utils';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private prisma: PrismaService,
  ) {}

  async validateUser(email: string, password: string): Promise<any> {
    const user = await this.usersService.findByEmail(email);
    if (
      user &&
      user.passwordHash &&
      (await compare(password, user.passwordHash))
    ) {
      const { passwordHash, ...result } = user;
      return result;
    }
    return null;
  }

  async login(loginDto: LoginDto, ipAddress?: string, userAgent?: string) {
    const user = await this.validateUser(loginDto.email, loginDto.password);
    if (!user) {
      // Record failed attempt
      await this.prisma.loginAttempt.create({
        data: {
          email: loginDto.email,
          ipAddress,
          status: 'FAILED',
          failureReason: 'Invalid credentials',
        },
      });
      throw new UnauthorizedException('Invalid credentials');
    }

    // Success attempt
    await this.prisma.loginAttempt.create({
      data: {
        email: loginDto.email,
        ipAddress,
        status: 'SUCCESS',
      },
    });

    // Fetch roles and permissions
    const userRoles = user.roles ?? [];
    const roles = extractRoleNames(userRoles);
    const permissions = extractPermissionNames(userRoles);

    const payload = {
      email: user.email,
      sub: user.id,
      organizationId: user.organizationId,
      branchId: user.branchId,
      roles,
      permissions,
    };

    const accessToken = this.jwtService.sign(payload);
    const refreshToken = randomUUID();
    const refreshTokenHash = await hash(refreshToken, 10);

    // Create session (F-003)
    const session = await this.prisma.userSession.create({
      data: {
        userId: user.id,
        organizationId: user.organizationId,
        branchId: user.branchId,
        ipAddress,
        deviceName: userAgent,
        refreshTokenHash,
      },
    });

    return {
      accessToken,
      refreshToken,
      sessionId: session.id,
      user: {
        ...user,
        roles,
        permissions,
      },
    };
  }

  async refresh(refreshToken: string, sessionId: string) {
    const session = await this.prisma.userSession.findFirst({
      where: { id: sessionId, status: 'ACTIVE' },
      include: { user: true },
    });

    if (
      !session ||
      !session.refreshTokenHash ||
      !(await compare(refreshToken, session.refreshTokenHash))
    ) {
      throw new UnauthorizedException('Invalid refresh token or session');
    }

    // Rotate refresh token (Security Hardening)
    const newRefreshToken = randomUUID();
    const newRefreshTokenHash = await hash(newRefreshToken, 10);

    await this.prisma.userSession.update({
      where: { id: session.id },
      data: { refreshTokenHash: newRefreshTokenHash },
    });

    const user = await this.usersService.findByEmail(session.user.email);

    if (!user) {
      throw new UnauthorizedException('User no longer exists');
    }

    const roles = extractRoleNames(user.roles);
    const permissions = extractPermissionNames(user.roles);

    const payload = {
      email: user.email,
      sub: user.id,
      organizationId: user.organizationId,
      branchId: user.branchId,
      roles,
      permissions,
    };

    return {
      accessToken: this.jwtService.sign(payload),
      refreshToken: newRefreshToken,
    };
  }

  async logout(sessionId: string) {
    return this.prisma.userSession.update({
      where: { id: sessionId },
      data: { status: 'INACTIVE', logoutAt: new Date() },
    });
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

      const access = await ensureOrganizationAccess(tx, org.id, branch.id);

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

      const ownerRole = access.rolesByName.get('Organization Owner');

      if (ownerRole) {
        await tx.userRole.upsert({
          where: {
            userId_roleId: {
              userId: user.id,
              roleId: ownerRole.id,
            },
          },
          update: {},
          create: {
            organizationId: org.id,
            branchId: branch.id,
            userId: user.id,
            roleId: ownerRole.id,
          },
        });
      }

      return {
        message: 'Clinic registered successfully',
        organizationId: org.id,
        userId: user.id,
      };
    });
  }
}
