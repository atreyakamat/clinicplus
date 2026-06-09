import { PrismaService } from '../prisma/prisma.service';
export declare class TimelineService {
    private prisma;
    constructor(prisma: PrismaService);
    record(data: {
        organizationId: string;
        patientId: string;
        eventType: string;
        eventCategory: string;
        title: string;
        description?: string;
        metadata?: any;
        createdBy?: string;
    }): Promise<{
        id: string;
        createdAt: Date;
        createdBy: string | null;
        organizationId: string;
        description: string | null;
        patientId: string;
        eventType: string;
        eventCategory: string;
        title: string;
        metadata: import("@prisma/client/runtime/library").JsonValue | null;
    }>;
    findAllByPatient(patientId: string, organizationId: string): Promise<{
        id: string;
        createdAt: Date;
        createdBy: string | null;
        organizationId: string;
        description: string | null;
        patientId: string;
        eventType: string;
        eventCategory: string;
        title: string;
        metadata: import("@prisma/client/runtime/library").JsonValue | null;
    }[]>;
}
