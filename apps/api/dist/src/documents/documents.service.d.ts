import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';
export declare class DocumentsService {
    private prisma;
    constructor(prisma: PrismaService);
    create(data: Prisma.MedicalDocumentUncheckedCreateInput, organizationId: string, branchId: string, uploadedBy: string): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        organizationId: string;
        branchId: string;
        patientId: string;
        title: string;
        documentType: string;
        fileUrl: string;
        mimeType: string | null;
        fileSize: number | null;
        uploadedAt: Date;
        uploadedBy: string;
    }>;
    findAll(organizationId: string, branchId: string): Promise<({
        patient: {
            id: string;
            firstName: string;
            lastName: string;
        };
        uploader: {
            id: string;
            firstName: string;
            lastName: string;
        };
    } & {
        id: string;
        createdAt: Date;
        updatedAt: Date;
        organizationId: string;
        branchId: string;
        patientId: string;
        title: string;
        documentType: string;
        fileUrl: string;
        mimeType: string | null;
        fileSize: number | null;
        uploadedAt: Date;
        uploadedBy: string;
    })[]>;
    findOne(id: string, organizationId: string, branchId: string): Promise<{
        patient: {
            id: string;
            firstName: string;
            lastName: string;
        };
        labReports: {
            id: string;
            status: string | null;
            createdAt: Date;
            updatedAt: Date;
            organizationId: string;
            branchId: string;
            patientId: string;
            consultationId: string | null;
            documentId: string;
            reportDate: Date;
        }[];
        imagingReports: {
            id: string;
            createdAt: Date;
            updatedAt: Date;
            organizationId: string;
            branchId: string;
            patientId: string;
            consultationId: string | null;
            documentId: string;
            reportDate: Date;
        }[];
        uploader: {
            id: string;
            firstName: string;
            lastName: string;
        };
    } & {
        id: string;
        createdAt: Date;
        updatedAt: Date;
        organizationId: string;
        branchId: string;
        patientId: string;
        title: string;
        documentType: string;
        fileUrl: string;
        mimeType: string | null;
        fileSize: number | null;
        uploadedAt: Date;
        uploadedBy: string;
    }>;
    update(id: string, data: Prisma.MedicalDocumentUpdateInput, organizationId: string, branchId: string): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        organizationId: string;
        branchId: string;
        patientId: string;
        title: string;
        documentType: string;
        fileUrl: string;
        mimeType: string | null;
        fileSize: number | null;
        uploadedAt: Date;
        uploadedBy: string;
    }>;
    remove(id: string, organizationId: string, branchId: string): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        organizationId: string;
        branchId: string;
        patientId: string;
        title: string;
        documentType: string;
        fileUrl: string;
        mimeType: string | null;
        fileSize: number | null;
        uploadedAt: Date;
        uploadedBy: string;
    }>;
}
