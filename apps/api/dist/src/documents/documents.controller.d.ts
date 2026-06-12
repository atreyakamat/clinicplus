import { DocumentsService } from './documents.service';
import { MalwareScannerService } from '../security/malware-scanner.service';
export declare class DocumentsController {
    private readonly documentsService;
    private readonly malwareScannerService;
    constructor(documentsService: DocumentsService, malwareScannerService: MalwareScannerService);
    uploadFile(file: Express.Multer.File, body: {
        patientId: string;
        documentType: string;
        title: string;
    }, req: any): Promise<{
        id: string;
        organizationId: string;
        branchId: string;
        createdAt: Date;
        updatedAt: Date;
        patientId: string;
        title: string;
        uploadedBy: string;
        documentType: string;
        fileUrl: string;
        mimeType: string | null;
        fileSize: number | null;
        uploadedAt: Date;
    }>;
    create(data: any, req: any): Promise<{
        id: string;
        organizationId: string;
        branchId: string;
        createdAt: Date;
        updatedAt: Date;
        patientId: string;
        title: string;
        uploadedBy: string;
        documentType: string;
        fileUrl: string;
        mimeType: string | null;
        fileSize: number | null;
        uploadedAt: Date;
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
        organizationId: string;
        branchId: string;
        createdAt: Date;
        updatedAt: Date;
        patientId: string;
        title: string;
        uploadedBy: string;
        documentType: string;
        fileUrl: string;
        mimeType: string | null;
        fileSize: number | null;
        uploadedAt: Date;
    })[]>;
    findOne(id: string, req: any): Promise<{
        patient: {
            id: string;
            firstName: string;
            lastName: string;
        };
        labReports: {
            id: string;
            organizationId: string;
            branchId: string;
            status: string | null;
            createdAt: Date;
            updatedAt: Date;
            patientId: string;
            consultationId: string | null;
            documentId: string;
            reportDate: Date;
        }[];
        imagingReports: {
            id: string;
            organizationId: string;
            branchId: string;
            createdAt: Date;
            updatedAt: Date;
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
        organizationId: string;
        branchId: string;
        createdAt: Date;
        updatedAt: Date;
        patientId: string;
        title: string;
        uploadedBy: string;
        documentType: string;
        fileUrl: string;
        mimeType: string | null;
        fileSize: number | null;
        uploadedAt: Date;
    }>;
    update(id: string, data: any, req: any): Promise<{
        id: string;
        organizationId: string;
        branchId: string;
        createdAt: Date;
        updatedAt: Date;
        patientId: string;
        title: string;
        uploadedBy: string;
        documentType: string;
        fileUrl: string;
        mimeType: string | null;
        fileSize: number | null;
        uploadedAt: Date;
    }>;
    remove(id: string, req: any): Promise<{
        id: string;
        organizationId: string;
        branchId: string;
        createdAt: Date;
        updatedAt: Date;
        patientId: string;
        title: string;
        uploadedBy: string;
        documentType: string;
        fileUrl: string;
        mimeType: string | null;
        fileSize: number | null;
        uploadedAt: Date;
    }>;
}
