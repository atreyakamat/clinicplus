import { PrismaService } from '../../prisma/prisma.service';
export declare class AuditService {
    private prisma;
    constructor(prisma: PrismaService);
    log(data: {
        organizationId: string;
        userId: string;
        action: string;
        resource: string;
        resourceId?: string;
        beforeData?: any;
        afterData?: any;
        ipAddress?: string;
        userAgent?: string;
    }): Promise<{
        id: string;
        createdAt: Date;
        organizationId: string;
        branchId: string | null;
        action: string;
        ipAddress: string | null;
        actorId: string | null;
        entityType: string | null;
        entityId: string | null;
        beforeData: import("@prisma/client/runtime/library").JsonValue | null;
        afterData: import("@prisma/client/runtime/library").JsonValue | null;
        userAgent: string | null;
    }>;
}
