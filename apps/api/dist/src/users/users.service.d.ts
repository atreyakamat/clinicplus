import { PrismaService } from '../prisma/prisma.service';
export declare class UsersService {
    private prisma;
    constructor(prisma: PrismaService);
    findByEmail(email: string): Promise<({
        roles: ({
            role: {
                rolePermissions: ({
                    permission: {
                        id: string;
                        organizationId: string | null;
                        branchId: string | null;
                        createdAt: Date;
                        updatedAt: Date;
                        module: string;
                        action: string;
                        description: string | null;
                    };
                } & {
                    id: string;
                    organizationId: string;
                    branchId: string | null;
                    createdAt: Date;
                    updatedAt: Date;
                    roleId: string;
                    permissionId: string;
                })[];
            } & {
                id: string;
                organizationId: string;
                branchId: string | null;
                createdAt: Date;
                updatedAt: Date;
                createdBy: string | null;
                updatedBy: string | null;
                deletedAt: Date | null;
                deletedBy: string | null;
                deleteReason: string | null;
                name: string;
                description: string | null;
            };
        } & {
            id: string;
            organizationId: string;
            branchId: string;
            createdAt: Date;
            updatedAt: Date;
            userId: string;
            roleId: string;
        })[];
    } & {
        id: string;
        organizationId: string;
        branchId: string;
        firstName: string;
        lastName: string;
        phone: string | null;
        email: string;
        status: import("@prisma/client").$Enums.RecordStatus;
        createdAt: Date;
        updatedAt: Date;
        createdBy: string | null;
        updatedBy: string | null;
        deletedAt: Date | null;
        deletedBy: string | null;
        deleteReason: string | null;
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
    }) | null>;
    findAll(organizationId: string, branchId: string, role?: string): Promise<({
        roles: ({
            role: {
                id: string;
                organizationId: string;
                branchId: string | null;
                createdAt: Date;
                updatedAt: Date;
                createdBy: string | null;
                updatedBy: string | null;
                deletedAt: Date | null;
                deletedBy: string | null;
                deleteReason: string | null;
                name: string;
                description: string | null;
            };
        } & {
            id: string;
            organizationId: string;
            branchId: string;
            createdAt: Date;
            updatedAt: Date;
            userId: string;
            roleId: string;
        })[];
    } & {
        id: string;
        organizationId: string;
        branchId: string;
        firstName: string;
        lastName: string;
        phone: string | null;
        email: string;
        status: import("@prisma/client").$Enums.RecordStatus;
        createdAt: Date;
        updatedAt: Date;
        createdBy: string | null;
        updatedBy: string | null;
        deletedAt: Date | null;
        deletedBy: string | null;
        deleteReason: string | null;
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
    })[]>;
    findOne(id: string, organizationId: string, branchId: string): Promise<({
        roles: ({
            role: {
                id: string;
                organizationId: string;
                branchId: string | null;
                createdAt: Date;
                updatedAt: Date;
                createdBy: string | null;
                updatedBy: string | null;
                deletedAt: Date | null;
                deletedBy: string | null;
                deleteReason: string | null;
                name: string;
                description: string | null;
            };
        } & {
            id: string;
            organizationId: string;
            branchId: string;
            createdAt: Date;
            updatedAt: Date;
            userId: string;
            roleId: string;
        })[];
    } & {
        id: string;
        organizationId: string;
        branchId: string;
        firstName: string;
        lastName: string;
        phone: string | null;
        email: string;
        status: import("@prisma/client").$Enums.RecordStatus;
        createdAt: Date;
        updatedAt: Date;
        createdBy: string | null;
        updatedBy: string | null;
        deletedAt: Date | null;
        deletedBy: string | null;
        deleteReason: string | null;
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
    }) | null>;
    update(id: string, data: any, organizationId: string, branchId: string): Promise<{
        id: string;
        organizationId: string;
        branchId: string;
        firstName: string;
        lastName: string;
        phone: string | null;
        email: string;
        status: import("@prisma/client").$Enums.RecordStatus;
        createdAt: Date;
        updatedAt: Date;
        createdBy: string | null;
        updatedBy: string | null;
        deletedAt: Date | null;
        deletedBy: string | null;
        deleteReason: string | null;
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
    }>;
}
