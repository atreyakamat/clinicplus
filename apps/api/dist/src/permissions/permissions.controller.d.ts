import { PermissionsService } from './permissions.service';
export declare class PermissionsController {
    private readonly permissionsService;
    constructor(permissionsService: PermissionsService);
    findAll(req: any): Promise<{
        id: string;
        organizationId: string | null;
        branchId: string | null;
        createdAt: Date;
        updatedAt: Date;
        module: string;
        action: string;
        description: string | null;
    }[]>;
}
