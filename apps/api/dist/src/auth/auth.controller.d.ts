import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
export declare class AuthController {
    private readonly authService;
    constructor(authService: AuthService);
    login(loginDto: LoginDto, ip: string, userAgent: string): Promise<{
        accessToken: string;
        refreshToken: `${string}-${string}-${string}-${string}-${string}`;
        sessionId: string;
        user: any;
    }>;
    refresh(body: {
        refreshToken: string;
        sessionId: string;
    }): Promise<{
        accessToken: string;
        refreshToken: `${string}-${string}-${string}-${string}-${string}`;
    }>;
    register(registerDto: RegisterDto): Promise<{
        message: string;
        organizationId: string;
        userId: string;
    }>;
    logout(body: {
        sessionId: string;
    }): Promise<{
        id: string;
        organizationId: string;
        branchId: string;
        status: import("@prisma/client").$Enums.RecordStatus;
        createdAt: Date;
        updatedAt: Date;
        userId: string;
        ipAddress: string | null;
        deviceName: string | null;
        loginAt: Date;
        logoutAt: Date | null;
        refreshTokenHash: string | null;
    }>;
    getProfile(req: any): any;
}
