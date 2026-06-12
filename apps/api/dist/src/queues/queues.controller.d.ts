import { QueuesService } from './queues.service';
export declare class QueuesController {
    private readonly queuesService;
    constructor(queuesService: QueuesService);
    getLiveQueue(req: any): Promise<{
        entries: {
            id: string;
            organizationId: string;
            branchId: string;
            status: import("@prisma/client").$Enums.QueueEntryStatus;
            createdAt: Date;
            updatedAt: Date;
            appointmentId: string;
            tokenNumber: number;
            queueId: string;
            checkInTime: Date | null;
            calledTime: Date | null;
            completedTime: Date | null;
        }[];
    } & {
        id: string;
        organizationId: string;
        branchId: string;
        createdAt: Date;
        updatedAt: Date;
        name: string;
        description: string | null;
    }>;
    checkIn(data: {
        appointmentId: string;
    }, req: any): Promise<{
        id: string;
        organizationId: string;
        branchId: string;
        status: import("@prisma/client").$Enums.QueueEntryStatus;
        createdAt: Date;
        updatedAt: Date;
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
        organizationId: string;
        branchId: string;
        status: import("@prisma/client").$Enums.QueueEntryStatus;
        createdAt: Date;
        updatedAt: Date;
        appointmentId: string;
        tokenNumber: number;
        queueId: string;
        checkInTime: Date | null;
        calledTime: Date | null;
        completedTime: Date | null;
    }>;
}
