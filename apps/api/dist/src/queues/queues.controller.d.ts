import { QueuesService } from './queues.service';
export declare class QueuesController {
    private readonly queuesService;
    constructor(queuesService: QueuesService);
    getLiveQueue(req: any): Promise<{
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
    checkIn(data: {
        appointmentId: string;
    }, req: any): Promise<{
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
    updateStatus(id: string, data: {
        status: 'WAITING' | 'CALLED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
    }): Promise<{
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
