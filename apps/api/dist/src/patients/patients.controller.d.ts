import { PatientsService } from './patients.service';
export declare class PatientsController {
    private readonly patientsService;
    constructor(patientsService: PatientsService);
    create(data: any, req: any): Promise<{
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
        firstName: string;
        lastName: string;
        branchId: string;
        patientCode: string | null;
        middleName: string | null;
        gender: string | null;
        dateOfBirth: Date | null;
        bloodGroup: string | null;
        maritalStatus: string | null;
        occupation: string | null;
        abhaNumber: string | null;
    }>;
    exportCsv(req: any, res: any): Promise<any>;
    search(req: any, query: string): Promise<{
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
        firstName: string;
        lastName: string;
        branchId: string;
        patientCode: string | null;
        middleName: string | null;
        gender: string | null;
        dateOfBirth: Date | null;
        bloodGroup: string | null;
        maritalStatus: string | null;
        occupation: string | null;
        abhaNumber: string | null;
    }[]>;
    importCsv(data: any[], req: any): Promise<{
        imported: number;
    }>;
}
