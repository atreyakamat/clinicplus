import { PrismaService } from '../../prisma/prisma.service';
export declare class ImportService {
    private prisma;
    constructor(prisma: PrismaService);
    validateAndPreview(entity: string, data: any[]): Promise<{
        total: number;
        preview: any[];
        errors: any[] | null;
        errorCount: number;
    }>;
    processImport(entity: string, data: any[], context: {
        organizationId: string;
        branchId: string;
        userId: string;
    }): Promise<{
        importedCount: number;
    }>;
}
