import { UsersService } from './users.service';
export declare class UsersController {
    private readonly usersService;
    constructor(usersService: UsersService);
    findAll(req: any, role?: string): Promise<({
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
    findOne(id: string, req: any): Promise<({
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
    update(id: string, data: any, req: any): Promise<{
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
