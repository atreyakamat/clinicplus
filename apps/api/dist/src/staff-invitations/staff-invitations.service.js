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
exports.StaffInvitationsService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const faker_1 = require("@faker-js/faker");
let StaffInvitationsService = class StaffInvitationsService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async create(data) {
        const existingUser = await this.prisma.user.findFirst({
            where: { email: data.email, organizationId: data.organizationId },
        });
        if (existingUser) {
            throw new common_1.ConflictException('User already belongs to this organization');
        }
        const token = faker_1.faker.string.uuid();
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 7);
        return this.prisma.staffInvitation.create({
            data: {
                email: data.email,
                phone: data.phone,
                roleId: data.roleId,
                organizationId: data.organizationId,
                token,
                expiresAt,
            },
        });
    }
    async findAll(organizationId) {
        return this.prisma.staffInvitation.findMany({
            where: { organizationId },
            orderBy: { createdAt: 'desc' },
        });
    }
    async findByToken(token) {
        const invitation = await this.prisma.staffInvitation.findUnique({
            where: { token },
            include: { organization: true },
        });
        if (!invitation) {
            throw new common_1.NotFoundException('Invitation not found');
        }
        if (invitation.expiresAt < new Date()) {
            throw new common_1.ConflictException('Invitation has expired');
        }
        return invitation;
    }
    async accept(token, userData) {
        const invitation = await this.findByToken(token);
        return this.prisma.$transaction(async (tx) => {
            const user = await tx.user.create({
                data: {
                    organizationId: invitation.organizationId,
                    branchId: (await tx.branch.findFirst({
                        where: { organizationId: invitation.organizationId },
                    }))?.id || '',
                    email: invitation.email,
                    firstName: userData.firstName,
                    lastName: userData.lastName,
                    passwordHash: userData.passwordHash,
                },
            });
            await tx.userRole.create({
                data: {
                    organizationId: invitation.organizationId,
                    branchId: user.branchId,
                    userId: user.id,
                    roleId: invitation.roleId,
                },
            });
            await tx.staffInvitation.update({
                where: { id: invitation.id },
                data: { status: 'ACCEPTED' },
            });
            return user;
        });
    }
};
exports.StaffInvitationsService = StaffInvitationsService;
exports.StaffInvitationsService = StaffInvitationsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], StaffInvitationsService);
//# sourceMappingURL=staff-invitations.service.js.map