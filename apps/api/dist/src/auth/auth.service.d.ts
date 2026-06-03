import { UsersService } from '../users/users.service';
import { JwtService } from '@nestjs/jwt';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { PrismaService } from '../prisma/prisma.service';
export declare class AuthService {
    private usersService;
    private jwtService;
    private prisma;
    constructor(usersService: UsersService, jwtService: JwtService, prisma: PrismaService);
    validateUser(email: string, password: string): Promise<any>;
    login(loginDto: LoginDto, ipAddress?: string, userAgent?: string): Promise<{
        accessToken: string;
        refreshToken: string;
        sessionId: string;
        user: any;
    }>;
    refresh(refreshToken: string, sessionId: string): Promise<{
        accessToken: string;
        refreshToken: string;
    }>;
    logout(sessionId: string): Promise<{
        id: string;
        status: import("@prisma/client").$Enums.RecordStatus;
        createdAt: Date;
        updatedAt: Date;
        organizationId: string;
        branchId: string;
        userId: string;
        ipAddress: string | null;
        deviceName: string | null;
        loginAt: Date;
        logoutAt: Date | null;
        refreshTokenHash: string | null;
    }>;
    register(registerDto: RegisterDto): Promise<{
        message: string;
        organizationId: string;
        userId: string;
    }>;
}
