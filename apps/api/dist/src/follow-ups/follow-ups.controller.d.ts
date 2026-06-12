import { FollowUpsService } from './follow-ups.service';
export declare class FollowUpsController {
    private readonly followUpsService;
    constructor(followUpsService: FollowUpsService);
    create(data: any, req: any): Promise<{
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
    findAll(req: any): Promise<({
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
    updateStatus(id: string, status: string, req: any): Promise<{
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
    addOutcome(id: string, data: any, req: any): Promise<{
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
}
