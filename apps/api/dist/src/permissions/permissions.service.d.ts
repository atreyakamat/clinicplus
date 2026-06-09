import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';
export declare class PermissionsService {
    private prisma;
    constructor(prisma: PrismaService);
    create(data: Prisma.PermissionCreateInput): Promise<{
        module: string;
        action: string;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        organizationId: string | null;
        branchId: string | null;
        description: string | null;
    }>;
    findAll(organizationId?: string, branchId?: string): Promise<{
        module: string;
        action: string;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        organizationId: string | null;
        branchId: string | null;
        description: string | null;
    }[]>;
    findOne(id: string): Promise<{
        module: string;
        action: string;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        organizationId: string | null;
        branchId: string | null;
        description: string | null;
    } | null>;
    update(id: string, data: Prisma.PermissionUpdateInput): Promise<{
        module: string;
        action: string;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        organizationId: string | null;
        branchId: string | null;
        description: string | null;
    }>;
    remove(id: string): Promise<{
        module: string;
        action: string;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        organizationId: string | null;
        branchId: string | null;
        description: string | null;
    }>;
}
