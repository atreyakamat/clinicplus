import { PrismaService } from '../prisma/prisma.service';
export declare class FollowUpsService {
    private prisma;
    constructor(prisma: PrismaService);
    create(data: any): Promise<{
        id: string;
        organizationId: string;
        branchId: string;
        status: string | null;
        createdAt: Date;
        updatedAt: Date;
        notes: string | null;
        patientId: string;
        doctorId: string;
        consultationId: string | null;
        scheduledDate: Date;
    }>;
    findAll(organizationId: string, branchId: string): Promise<({
        patient: {
            firstName: string;
            lastName: string;
            phone: string | null;
        };
        doctor: {
            firstName: string;
            lastName: string;
        };
        outcomes: {
            id: string;
            organizationId: string;
            branchId: string;
            createdAt: Date;
            updatedAt: Date;
            outcomeType: string;
            remarks: string | null;
            recordedAt: Date;
            followUpId: string;
        }[];
    } & {
        id: string;
        organizationId: string;
        branchId: string;
        status: string | null;
        createdAt: Date;
        updatedAt: Date;
        notes: string | null;
        patientId: string;
        doctorId: string;
        consultationId: string | null;
        scheduledDate: Date;
    })[]>;
    findOne(id: string, organizationId: string, branchId: string): Promise<{
        patient: {
            firstName: string;
            lastName: string;
            phone: string | null;
        };
        doctor: {
            firstName: string;
            lastName: string;
        };
        outcomes: {
            id: string;
            organizationId: string;
            branchId: string;
            createdAt: Date;
            updatedAt: Date;
            outcomeType: string;
            remarks: string | null;
            recordedAt: Date;
            followUpId: string;
        }[];
    } & {
        id: string;
        organizationId: string;
        branchId: string;
        status: string | null;
        createdAt: Date;
        updatedAt: Date;
        notes: string | null;
        patientId: string;
        doctorId: string;
        consultationId: string | null;
        scheduledDate: Date;
    }>;
    addOutcome(followUpId: string, data: any, organizationId: string): Promise<{
        id: string;
        organizationId: string;
        branchId: string;
        createdAt: Date;
        updatedAt: Date;
        outcomeType: string;
        remarks: string | null;
        recordedAt: Date;
        followUpId: string;
    }>;
    updateStatus(id: string, status: string, organizationId: string): Promise<{
        id: string;
        organizationId: string;
        branchId: string;
        status: string | null;
        createdAt: Date;
        updatedAt: Date;
        notes: string | null;
        patientId: string;
        doctorId: string;
        consultationId: string | null;
        scheduledDate: Date;
    }>;
}
