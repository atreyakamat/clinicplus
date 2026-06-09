import { UsersService } from './users.service';
export declare class UsersController {
    private readonly usersService;
    constructor(usersService: UsersService);
    findAll(req: any, role?: string): Promise<({
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
        branchId: string;
    })[]>;
    findOne(id: string, req: any): Promise<({
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
        branchId: string;
    }) | null>;
}
