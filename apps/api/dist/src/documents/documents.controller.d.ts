import { DocumentsService } from './documents.service';
export declare class DocumentsController {
    private readonly documentsService;
    constructor(documentsService: DocumentsService);
    create(data: any, req: any): Promise<{
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
    findAll(req: any): Promise<({
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
    findOne(id: string, req: any): Promise<{
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
    update(id: string, data: any, req: any): Promise<{
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
    remove(id: string, req: any): Promise<{
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
