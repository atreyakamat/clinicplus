import { PermissionsService } from './permissions.service';
export declare class PermissionsController {
    private readonly permissionsService;
    constructor(permissionsService: PermissionsService);
    findAll(req: any): Promise<{
        module: string;
        action: string;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        organizationId: string | null;
        branchId: string | null;
        description: string | null;
    }[]>;
}
