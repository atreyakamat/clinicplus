"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthService = void 0;
const common_1 = require("@nestjs/common");
const users_service_1 = require("../users/users.service");
const jwt_1 = require("@nestjs/jwt");
const bcryptjs_1 = require("bcryptjs");
const prisma_service_1 = require("../prisma/prisma.service");
const crypto_1 = require("crypto");
const access_bootstrap_1 = require("./access.bootstrap");
const access_utils_1 = require("./access.utils");
let AuthService = class AuthService {
    usersService;
    jwtService;
    prisma;
    constructor(usersService, jwtService, prisma) {
        this.usersService = usersService;
        this.jwtService = jwtService;
        this.prisma = prisma;
    }
    async validateUser(email, password) {
        const user = await this.usersService.findByEmail(email);
        if (user &&
            user.passwordHash &&
            (await (0, bcryptjs_1.compare)(password, user.passwordHash))) {
            const { passwordHash, ...result } = user;
            return result;
        }
        return null;
    }
    async login(loginDto, ipAddress, userAgent) {
        const user = await this.validateUser(loginDto.email, loginDto.password);
        if (!user) {
            await this.prisma.loginAttempt.create({
                data: {
                    email: loginDto.email,
                    ipAddress,
                    status: 'FAILED',
                    failureReason: 'Invalid credentials',
                },
            });
            throw new common_1.UnauthorizedException('Invalid credentials');
        }
        await this.prisma.loginAttempt.create({
            data: {
                email: loginDto.email,
                ipAddress,
                status: 'SUCCESS',
            },
        });
        const userRoles = user.roles ?? [];
        const roles = (0, access_utils_1.extractRoleNames)(userRoles);
        const permissions = (0, access_utils_1.extractPermissionNames)(userRoles);
        const payload = {
            email: user.email,
            sub: user.id,
            organizationId: user.organizationId,
            branchId: user.branchId,
            roles,
            permissions,
        };
        const accessToken = this.jwtService.sign(payload);
        const refreshToken = (0, crypto_1.randomUUID)();
        const refreshTokenHash = await (0, bcryptjs_1.hash)(refreshToken, 10);
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
    async refresh(refreshToken, sessionId) {
        if (!sessionId || !refreshToken) {
            throw new common_1.UnauthorizedException('Invalid refresh token or session');
        }
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        if (!uuidRegex.test(sessionId)) {
            throw new common_1.UnauthorizedException('Invalid refresh token or session');
        }
        const session = await this.prisma.userSession.findFirst({
            where: { id: sessionId, status: 'ACTIVE' },
            include: { user: true },
        });
        if (!session ||
            !session.refreshTokenHash ||
            !(await (0, bcryptjs_1.compare)(refreshToken, session.refreshTokenHash))) {
            throw new common_1.UnauthorizedException('Invalid refresh token or session');
        }
        const newRefreshToken = (0, crypto_1.randomUUID)();
        const newRefreshTokenHash = await (0, bcryptjs_1.hash)(newRefreshToken, 10);
        await this.prisma.userSession.update({
            where: { id: session.id },
            data: { refreshTokenHash: newRefreshTokenHash },
        });
        const user = await this.usersService.findByEmail(session.user.email);
        if (!user) {
            throw new common_1.UnauthorizedException('User no longer exists');
        }
        const roles = (0, access_utils_1.extractRoleNames)(user.roles);
        const permissions = (0, access_utils_1.extractPermissionNames)(user.roles);
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
    async logout(sessionId) {
        return this.prisma.userSession.update({
            where: { id: sessionId },
            data: { status: 'INACTIVE', logoutAt: new Date() },
        });
    }
    async register(registerDto) {
        const existingUser = await this.prisma.user.findFirst({
            where: { email: registerDto.email },
        });
        if (existingUser) {
            throw new common_1.ConflictException('Email already exists');
        }
        const existingClinic = await this.prisma.organization.findUnique({
            where: { slug: registerDto.clinicSlug },
        });
        if (existingClinic) {
            throw new common_1.ConflictException('Clinic slug already exists');
        }
        const passwordHash = await (0, bcryptjs_1.hash)(registerDto.password, 10);
        return this.prisma.$transaction(async (tx) => {
            const org = await tx.organization.create({
                data: {
                    name: registerDto.clinicName,
                    slug: registerDto.clinicSlug,
                    email: registerDto.email,
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
                    country: registerDto.country,
                },
            });
            const access = await (0, access_bootstrap_1.ensureOrganizationAccess)(tx, org.id, branch.id);
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
};
exports.AuthService = AuthService;
exports.AuthService = AuthService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [users_service_1.UsersService,
        jwt_1.JwtService,
        prisma_service_1.PrismaService])
], AuthService);
//# sourceMappingURL=auth.service.js.map