import { PrescriptionsService } from './prescriptions.service';
import { PdfService } from '../common/services/pdf.service';
import { OrganizationsService } from '../organizations/organizations.service';
export declare class PrescriptionsController {
    private readonly prescriptionsService;
    private readonly pdfService;
    private readonly organizationsService;
    constructor(prescriptionsService: PrescriptionsService, pdfService: PdfService, organizationsService: OrganizationsService);
    create(data: any, req: any): Promise<{
        items: {
            id: string;
            organizationId: string;
            branchId: string;
            createdAt: Date;
            updatedAt: Date;
            prescriptionId: string;
            medicineName: string;
            dosage: string | null;
            frequency: string | null;
            duration: string | null;
            instructions: string | null;
        }[];
    } & {
        id: string;
        organizationId: string;
        branchId: string;
        createdAt: Date;
        updatedAt: Date;
        patientId: string;
        doctorId: string;
        consultationId: string | null;
        issuedAt: Date;
    }>;
    download(id: string, req: any, res: any): Promise<void>;
    findAll(patientId: string | undefined, req: any): Promise<({
        patient: {
            id: string;
            firstName: string;
            lastName: string;
        };
        doctor: {
            id: string;
            firstName: string;
            lastName: string;
        };
        items: {
            id: string;
            organizationId: string;
            branchId: string;
            createdAt: Date;
            updatedAt: Date;
            prescriptionId: string;
            medicineName: string;
            dosage: string | null;
            frequency: string | null;
            duration: string | null;
            instructions: string | null;
        }[];
    } & {
        id: string;
        organizationId: string;
        branchId: string;
        createdAt: Date;
        updatedAt: Date;
        patientId: string;
        doctorId: string;
        consultationId: string | null;
        issuedAt: Date;
    })[]>;
    findOne(id: string, req: any): Promise<{
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
        consultation: {
            id: string;
            organizationId: string;
            branchId: string;
            status: import("@prisma/client").$Enums.ConsultationStatus;
            createdAt: Date;
            updatedAt: Date;
            createdBy: string | null;
            updatedBy: string | null;
            deletedAt: Date | null;
            deletedBy: string | null;
            deleteReason: string | null;
            patientId: string;
            doctorId: string;
            appointmentId: string | null;
            chiefComplaint: string | null;
            historyOfPresentIllness: string | null;
            clinicalAssessment: string | null;
            treatmentPlan: string | null;
            consultationDate: Date;
        } | null;
        doctor: {
            firstName: string;
            lastName: string;
        };
        items: {
            id: string;
            organizationId: string;
            branchId: string;
            createdAt: Date;
            updatedAt: Date;
            prescriptionId: string;
            medicineName: string;
            dosage: string | null;
            frequency: string | null;
            duration: string | null;
            instructions: string | null;
        }[];
    } & {
        id: string;
        organizationId: string;
        branchId: string;
        createdAt: Date;
        updatedAt: Date;
        patientId: string;
        doctorId: string;
        consultationId: string | null;
        issuedAt: Date;
    }>;
}
