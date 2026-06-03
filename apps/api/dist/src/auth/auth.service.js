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
        if (user && user.passwordHash && (await (0, bcryptjs_1.compare)(password, user.passwordHash))) {
            const { passwordHash, ...result } = user;
            return result;
        }
        return null;
    }
    async login(loginDto) {
        const user = await this.validateUser(loginDto.email, loginDto.password);
        if (!user) {
            throw new common_1.UnauthorizedException('Invalid credentials');
        }
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
};
exports.AuthService = AuthService;
exports.AuthService = AuthService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [users_service_1.UsersService,
        jwt_1.JwtService,
        prisma_service_1.PrismaService])
], AuthService);
//# sourceMappingURL=auth.service.js.map