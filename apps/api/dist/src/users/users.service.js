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
exports.UsersService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const access_utils_1 = require("../auth/access.utils");
let UsersService = class UsersService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async findByEmail(email) {
        return this.prisma.user.findFirst({
            where: { email, status: 'ACTIVE' },
            include: {
                roles: {
                    include: {
                        role: {
                            include: {
                                rolePermissions: {
                                    include: {
                                        permission: true,
                                    },
                                },
                            },
                        },
                    },
                },
            },
        });
    }
    async findAll(organizationId, branchId, role) {
        const users = await this.prisma.user.findMany({
            where: {
                organizationId,
                branchId,
                status: 'ACTIVE',
            },
            include: {
                roles: {
                    include: {
                        role: true,
                    },
                },
            },
            orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
        });
        if (!role) {
            return users;
        }
        const normalizedRole = (0, access_utils_1.normalizeRoleName)(role);
        return users.filter((user) => user.roles.some((entry) => (0, access_utils_1.normalizeRoleName)(entry.role.name) === normalizedRole));
    }
    async findOne(id, organizationId, branchId) {
        return this.prisma.user.findFirst({
            where: {
                id,
                organizationId,
                branchId,
                status: 'ACTIVE',
            },
            include: {
                roles: {
                    include: {
                        role: true,
                    },
                },
            },
        });
    }
    async update(id, data, organizationId, branchId) {
        return this.prisma.user.update({
            where: { id, organizationId, branchId },
            data,
        });
    }
};
exports.UsersService = UsersService;
exports.UsersService = UsersService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], UsersService);
//# sourceMappingURL=users.service.js.map