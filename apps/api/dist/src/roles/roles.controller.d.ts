import { RolesService } from './roles.service';
export declare class RolesController {
    private readonly rolesService;
    constructor(rolesService: RolesService);
    findAll(req: any): Promise<{
        id: string;
        organizationId: string;
        branchId: string | null;
        createdAt: Date;
        updatedAt: Date;
        createdBy: string | null;
        updatedBy: string | null;
        deletedAt: Date | null;
        deletedBy: string | null;
        deleteReason: string | null;
        name: string;
        description: string | null;
    }[]>;
    findOne(id: string): Promise<{
        id: string;
        organizationId: string;
        branchId: string | null;
        createdAt: Date;
        updatedAt: Date;
        createdBy: string | null;
        updatedBy: string | null;
        deletedAt: Date | null;
        deletedBy: string | null;
        deleteReason: string | null;
        name: string;
        description: string | null;
    } | null>;
    create(data: any, req: any): Promise<{
        id: string;
        organizationId: string;
        branchId: string | null;
        createdAt: Date;
        updatedAt: Date;
        createdBy: string | null;
        updatedBy: string | null;
        deletedAt: Date | null;
        deletedBy: string | null;
        deleteReason: string | null;
        name: string;
        description: string | null;
    }>;
    update(id: string, data: any): Promise<{
        id: string;
        organizationId: string;
        branchId: string | null;
        createdAt: Date;
        updatedAt: Date;
        createdBy: string | null;
        updatedBy: string | null;
        deletedAt: Date | null;
        deletedBy: string | null;
        deleteReason: string | null;
        name: string;
        description: string | null;
    }>;
}
