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
    }, tx?: any): Promise<any>;
    findAllByPatient(patientId: string, organizationId: string): Promise<{
        id: string;
        createdAt: Date;
        createdBy: string | null;
        organizationId: string;
        patientId: string;
        description: string | null;
        eventType: string;
        eventCategory: string;
        title: string;
        metadata: import("@prisma/client/runtime/library").JsonValue | null;
    }[]>;
}
