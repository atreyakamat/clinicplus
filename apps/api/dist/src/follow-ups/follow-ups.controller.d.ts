import { FollowUpsService } from './follow-ups.service';
export declare class FollowUpsController {
    private readonly followUpsService;
    constructor(followUpsService: FollowUpsService);
    create(data: any, req: any): Promise<{
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
    findAll(req: any): Promise<({
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
    updateStatus(id: string, status: string, req: any): Promise<{
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
    addOutcome(id: string, data: any, req: any): Promise<{
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
}
