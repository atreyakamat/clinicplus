import { PrismaService } from '../prisma/prisma.service';
export declare class QueuesService {
    private prisma;
    constructor(prisma: PrismaService);
    getLiveQueue(organizationId: string, branchId: string): Promise<{
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
    getQueueStatus(organizationId: string, branchId: string): Promise<({
        appointment: {
            patient: {
                id: string;
                organizationId: string;
                branchId: string;
                patientCode: string | null;
                firstName: string;
                middleName: string | null;
                lastName: string;
                gender: string | null;
                dateOfBirth: Date | null;
                phone: string | null;
                email: string | null;
                bloodGroup: string | null;
                maritalStatus: string | null;
                occupation: string | null;
                abhaNumber: string | null;
                status: import("@prisma/client").$Enums.RecordStatus;
                createdAt: Date;
                updatedAt: Date;
                createdBy: string | null;
                updatedBy: string | null;
                deletedAt: Date | null;
                deletedBy: string | null;
                deleteReason: string | null;
            };
            doctor: {
                firstName: string;
                lastName: string;
            };
        } & {
            id: string;
            organizationId: string;
            branchId: string;
            status: import("@prisma/client").$Enums.AppointmentStatus;
            createdAt: Date;
            updatedAt: Date;
            createdBy: string | null;
            updatedBy: string | null;
            deletedAt: Date | null;
            deletedBy: string | null;
            deleteReason: string | null;
            notes: string | null;
            patientId: string;
            doctorId: string;
            appointmentType: string | null;
            appointmentSource: string | null;
            scheduledStart: Date;
            scheduledEnd: Date;
        };
    } & {
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
    })[]>;
    checkIn(appointmentId: string, organizationId: string, branchId: string): Promise<{
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
    updateEntryStatus(entryId: string, status: 'WAITING' | 'CALLED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED'): Promise<{
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
