import { PrismaService } from '../prisma/prisma.service';
export declare class UsersService {
    private prisma;
    constructor(prisma: PrismaService);
    findByEmail(email: string): Promise<({
        roles: ({
            role: {
                rolePermissions: ({
                    permission: {
                        module: string;
                        action: string;
                        id: string;
                        createdAt: Date;
                        updatedAt: Date;
                        organizationId: string | null;
                        branchId: string | null;
                        description: string | null;
                    };
                } & {
                    id: string;
                    createdAt: Date;
                    updatedAt: Date;
                    organizationId: string;
                    branchId: string | null;
                    roleId: string;
                    permissionId: string;
                })[];
            } & {
                id: string;
                name: string;
                createdAt: Date;
                updatedAt: Date;
                createdBy: string | null;
                updatedBy: string | null;
                deletedAt: Date | null;
                deletedBy: string | null;
                deleteReason: string | null;
                organizationId: string;
                branchId: string | null;
                description: string | null;
            };
        } & {
            id: string;
            createdAt: Date;
            updatedAt: Date;
            organizationId: string;
            branchId: string;
            userId: string;
            roleId: string;
        })[];
    } & {
        id: string;
        email: string;
        phone: string | null;
        status: import("@prisma/client").$Enums.RecordStatus;
        createdAt: Date;
        updatedAt: Date;
        createdBy: string | null;
        updatedBy: string | null;
        deletedAt: Date | null;
        deletedBy: string | null;
        deleteReason: string | null;
        organizationId: string;
        firstName: string;
        lastName: string;
        avatarUrl: string | null;
        passwordHash: string | null;
        lastLoginAt: Date | null;
        qualification: string | null;
        specialization: string | null;
        registrationNumber: string | null;
        experienceYears: number | null;
        bio: string | null;
        consultationFee: import("@prisma/client/runtime/library").Decimal | null;
        signatureUrl: string | null;
        branchId: string;
    }) | null>;
    findAll(organizationId: string, branchId: string, role?: string): Promise<({
        roles: ({
            role: {
                id: string;
                name: string;
                createdAt: Date;
                updatedAt: Date;
                createdBy: string | null;
                updatedBy: string | null;
                deletedAt: Date | null;
                deletedBy: string | null;
                deleteReason: string | null;
                organizationId: string;
                branchId: string | null;
                description: string | null;
            };
        } & {
            id: string;
            createdAt: Date;
            updatedAt: Date;
            organizationId: string;
            branchId: string;
            userId: string;
            roleId: string;
        })[];
    } & {
        id: string;
        email: string;
        phone: string | null;
        status: import("@prisma/client").$Enums.RecordStatus;
        createdAt: Date;
        updatedAt: Date;
        createdBy: string | null;
        updatedBy: string | null;
        deletedAt: Date | null;
        deletedBy: string | null;
        deleteReason: string | null;
        organizationId: string;
        firstName: string;
        lastName: string;
        avatarUrl: string | null;
        passwordHash: string | null;
        lastLoginAt: Date | null;
        qualification: string | null;
        specialization: string | null;
        registrationNumber: string | null;
        experienceYears: number | null;
        bio: string | null;
        consultationFee: import("@prisma/client/runtime/library").Decimal | null;
        signatureUrl: string | null;
        branchId: string;
    })[]>;
    findOne(id: string, organizationId: string, branchId: string): Promise<({
        roles: ({
            role: {
                id: string;
                name: string;
                createdAt: Date;
                updatedAt: Date;
                createdBy: string | null;
                updatedBy: string | null;
                deletedAt: Date | null;
                deletedBy: string | null;
                deleteReason: string | null;
                organizationId: string;
                branchId: string | null;
                description: string | null;
            };
        } & {
            id: string;
            createdAt: Date;
            updatedAt: Date;
            organizationId: string;
            branchId: string;
            userId: string;
            roleId: string;
        })[];
    } & {
        id: string;
        email: string;
        phone: string | null;
        status: import("@prisma/client").$Enums.RecordStatus;
        createdAt: Date;
        updatedAt: Date;
        createdBy: string | null;
        updatedBy: string | null;
        deletedAt: Date | null;
        deletedBy: string | null;
        deleteReason: string | null;
        organizationId: string;
        firstName: string;
        lastName: string;
        avatarUrl: string | null;
        passwordHash: string | null;
        lastLoginAt: Date | null;
        qualification: string | null;
        specialization: string | null;
        registrationNumber: string | null;
        experienceYears: number | null;
        bio: string | null;
        consultationFee: import("@prisma/client/runtime/library").Decimal | null;
        signatureUrl: string | null;
        branchId: string;
    }) | null>;
    update(id: string, data: any, organizationId: string, branchId: string): Promise<{
        id: string;
        email: string;
        phone: string | null;
        status: import("@prisma/client").$Enums.RecordStatus;
        createdAt: Date;
        updatedAt: Date;
        createdBy: string | null;
        updatedBy: string | null;
        deletedAt: Date | null;
        deletedBy: string | null;
        deleteReason: string | null;
        organizationId: string;
        firstName: string;
        lastName: string;
        avatarUrl: string | null;
        passwordHash: string | null;
        lastLoginAt: Date | null;
        qualification: string | null;
        specialization: string | null;
        registrationNumber: string | null;
        experienceYears: number | null;
        bio: string | null;
        consultationFee: import("@prisma/client/runtime/library").Decimal | null;
        signatureUrl: string | null;
        branchId: string;
    }>;
}
