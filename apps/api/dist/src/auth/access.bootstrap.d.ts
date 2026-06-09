export declare function ensureOrganizationAccess(db: any, organizationId: string, branchId?: string | null): Promise<{
    permissions: any[];
    rolesByName: Map<any, any>;
}>;
