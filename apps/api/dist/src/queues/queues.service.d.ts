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
    getQueueStatus(organizationId: string, branchId: string): Promise<({
        appointment: {
            patient: {
                id: string;
                email: string | null;
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
                branchId: string;
                firstName: string;
                lastName: string;
                patientCode: string | null;
                middleName: string | null;
                gender: string | null;
                dateOfBirth: Date | null;
                bloodGroup: string | null;
                maritalStatus: string | null;
                occupation: string | null;
                abhaNumber: string | null;
            };
            doctor: {
                firstName: string;
                lastName: string;
            };
        } & {
            id: string;
            status: import("@prisma/client").$Enums.AppointmentStatus;
            createdAt: Date;
            updatedAt: Date;
            createdBy: string | null;
            updatedBy: string | null;
            deletedAt: Date | null;
            deletedBy: string | null;
            deleteReason: string | null;
            organizationId: string;
            branchId: string;
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
    })[]>;
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
