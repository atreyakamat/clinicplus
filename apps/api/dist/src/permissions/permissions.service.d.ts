import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';
export declare class PermissionsService {
    private prisma;
    constructor(prisma: PrismaService);
    create(data: Prisma.PermissionCreateInput): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        organizationId: string | null;
        branchId: string | null;
        description: string | null;
        module: string;
        action: string;
    }>;
    findAll(organizationId?: string, branchId?: string): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        organizationId: string | null;
        branchId: string | null;
        description: string | null;
        module: string;
        action: string;
    }[]>;
    findOne(id: string): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        organizationId: string | null;
        branchId: string | null;
        description: string | null;
        module: string;
        action: string;
    } | null>;
    update(id: string, data: Prisma.PermissionUpdateInput): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        organizationId: string | null;
        branchId: string | null;
        description: string | null;
        module: string;
        action: string;
    }>;
    remove(id: string): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        organizationId: string | null;
        branchId: string | null;
        description: string | null;
        module: string;
        action: string;
    }>;
}
