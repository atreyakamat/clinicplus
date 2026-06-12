import { PrismaService } from '../prisma/prisma.service';
export declare class RolesService {
    private prisma;
    constructor(prisma: PrismaService);
    create(data: any): Promise<{
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
    }>;
    findAll(organizationId: string, branchId?: string): Promise<{
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
    }[]>;
    findOne(id: string): Promise<{
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
    } | null>;
    update(id: string, data: any): Promise<{
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
    }>;
    remove(id: string): Promise<{
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
    }>;
}
