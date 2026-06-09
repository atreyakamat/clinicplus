import { PrismaService } from '../prisma/prisma.service';
export declare class PrescriptionsService {
    private prisma;
    constructor(prisma: PrismaService);
    create(data: any): Promise<{
        items: {
            id: string;
            createdAt: Date;
            updatedAt: Date;
            organizationId: string;
            branchId: string;
            medicineName: string;
            dosage: string | null;
            frequency: string | null;
            duration: string | null;
            instructions: string | null;
            prescriptionId: string;
        }[];
    } & {
        id: string;
        createdAt: Date;
        updatedAt: Date;
        organizationId: string;
        branchId: string;
        patientId: string;
        doctorId: string;
        issuedAt: Date;
        consultationId: string | null;
    }>;
    findAll(organizationId: string, branchId: string, patientId?: string): Promise<({
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
            createdAt: Date;
            updatedAt: Date;
            organizationId: string;
            branchId: string;
            medicineName: string;
            dosage: string | null;
            frequency: string | null;
            duration: string | null;
            instructions: string | null;
            prescriptionId: string;
        }[];
    } & {
        id: string;
        createdAt: Date;
        updatedAt: Date;
        organizationId: string;
        branchId: string;
        patientId: string;
        doctorId: string;
        issuedAt: Date;
        consultationId: string | null;
    })[]>;
    findOne(id: string, organizationId: string, branchId: string): Promise<{
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
        };
        doctor: {
            firstName: string;
            lastName: string;
        };
        consultation: {
            id: string;
            status: import("@prisma/client").$Enums.ConsultationStatus;
            createdAt: Date;
            updatedAt: Date;
            createdBy: string | null;
            updatedBy: string | null;
            deletedAt: Date | null;
            deletedBy: string | null;
            deleteReason: string | null;
            organizationId: string;
            branchId: string;
            patientId: string;
            doctorId: string;
            chiefComplaint: string | null;
            historyOfPresentIllness: string | null;
            clinicalAssessment: string | null;
            treatmentPlan: string | null;
            consultationDate: Date;
            appointmentId: string | null;
        } | null;
        items: {
            id: string;
            createdAt: Date;
            updatedAt: Date;
            organizationId: string;
            branchId: string;
            medicineName: string;
            dosage: string | null;
            frequency: string | null;
            duration: string | null;
            instructions: string | null;
            prescriptionId: string;
        }[];
    } & {
        id: string;
        createdAt: Date;
        updatedAt: Date;
        organizationId: string;
        branchId: string;
        patientId: string;
        doctorId: string;
        issuedAt: Date;
        consultationId: string | null;
    }>;
}
