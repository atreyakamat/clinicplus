import { PrismaService } from '../prisma/prisma.service';
export declare class QueuesService {
    private prisma;
    constructor(prisma: PrismaService);
    getLiveQueue(organizationId: string, branchId: string): Promise<{
        entries: {
            id: string;
            status: import("@prisma/client").$Enums.QueueEntryStatus;
            createdAt: Date;
            updatedAt: Date;
            organizationId: string;
            branchId: string;
            appointmentId: string;
            tokenNumber: number;
            queueId: string;
            checkInTime: Date | null;
            calledTime: Date | null;
            completedTime: Date | null;
        }[];
    } & {
        id: string;
        name: string;
        createdAt: Date;
        updatedAt: Date;
        organizationId: string;
        branchId: string;
        description: string | null;
    }>;
    checkIn(appointmentId: string, organizationId: string, branchId: string): Promise<{
        id: string;
        status: import("@prisma/client").$Enums.QueueEntryStatus;
        createdAt: Date;
        updatedAt: Date;
        organizationId: string;
        branchId: string;
        appointmentId: string;
        tokenNumber: number;
        queueId: string;
        checkInTime: Date | null;
        calledTime: Date | null;
        completedTime: Date | null;
    }>;
    updateEntryStatus(entryId: string, status: 'WAITING' | 'CALLED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED'): Promise<{
        id: string;
        status: import("@prisma/client").$Enums.QueueEntryStatus;
        createdAt: Date;
        updatedAt: Date;
        organizationId: string;
        branchId: string;
        appointmentId: string;
        tokenNumber: number;
        queueId: string;
        checkInTime: Date | null;
        calledTime: Date | null;
        completedTime: Date | null;
    }>;
}
