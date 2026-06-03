import { PrismaService } from '../prisma/prisma.service';
export declare class StaffInvitationsService {
    private prisma;
    constructor(prisma: PrismaService);
    create(data: {
        email: string;
        phone?: string;
        roleId: string;
        organizationId: string;
        branchId: string;
    }): Promise<{
        id: string;
        email: string;
        phone: string | null;
        status: string;
        createdAt: Date;
        updatedAt: Date;
        organizationId: string;
        roleId: string;
        token: string;
        expiresAt: Date;
    }>;
    findAll(organizationId: string): Promise<{
        id: string;
        email: string;
        phone: string | null;
        status: string;
        createdAt: Date;
        updatedAt: Date;
        organizationId: string;
        roleId: string;
        token: string;
        expiresAt: Date;
    }[]>;
    findByToken(token: string): Promise<{
        organization: {
            id: string;
            slug: string;
            name: string;
            legalName: string | null;
            logoUrl: string | null;
            website: string | null;
            email: string | null;
            phone: string | null;
            primaryColor: string | null;
            secondaryColor: string | null;
            letterheadUrl: string | null;
            footerText: string | null;
            watermarkUrl: string | null;
            subscriptionPlan: import("@prisma/client").$Enums.SubscriptionPlan | null;
            subscriptionStatus: import("@prisma/client").$Enums.SubscriptionStatus;
            status: import("@prisma/client").$Enums.RecordStatus;
            createdAt: Date;
            updatedAt: Date;
            createdBy: string | null;
            updatedBy: string | null;
            deletedAt: Date | null;
            deletedBy: string | null;
            deleteReason: string | null;
        };
    } & {
        id: string;
        email: string;
        phone: string | null;
        status: string;
        createdAt: Date;
        updatedAt: Date;
        organizationId: string;
        roleId: string;
        token: string;
        expiresAt: Date;
    }>;
    accept(token: string, userData: {
        firstName: string;
        lastName: string;
        passwordHash: string;
    }): Promise<{
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
    }>;
}
