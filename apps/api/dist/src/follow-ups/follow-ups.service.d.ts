import { PrismaService } from '../prisma/prisma.service';
export declare class FollowUpsService {
    private prisma;
    constructor(prisma: PrismaService);
    create(data: any): Promise<{
        id: string;
        status: string | null;
        createdAt: Date;
        updatedAt: Date;
        organizationId: string;
        branchId: string;
        notes: string | null;
        patientId: string;
        doctorId: string;
        consultationId: string | null;
        scheduledDate: Date;
    }>;
    findAll(organizationId: string, branchId: string): Promise<({
        patient: {
            phone: string | null;
            firstName: string;
            lastName: string;
        };
        doctor: {
            firstName: string;
            lastName: string;
        };
        outcomes: {
            id: string;
            createdAt: Date;
            updatedAt: Date;
            organizationId: string;
            branchId: string;
            outcomeType: string;
            remarks: string | null;
            recordedAt: Date;
            followUpId: string;
        }[];
    } & {
        id: string;
        status: string | null;
        createdAt: Date;
        updatedAt: Date;
        organizationId: string;
        branchId: string;
        notes: string | null;
        patientId: string;
        doctorId: string;
        consultationId: string | null;
        scheduledDate: Date;
    })[]>;
    addOutcome(followUpId: string, data: any, organizationId: string): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        organizationId: string;
        branchId: string;
        outcomeType: string;
        remarks: string | null;
        recordedAt: Date;
        followUpId: string;
    }>;
    updateStatus(id: string, status: string, organizationId: string): Promise<{
        id: string;
        status: string | null;
        createdAt: Date;
        updatedAt: Date;
        organizationId: string;
        branchId: string;
        notes: string | null;
        patientId: string;
        doctorId: string;
        consultationId: string | null;
        scheduledDate: Date;
    }>;
}
