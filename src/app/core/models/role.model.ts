export interface RolePermissions {
    smt: boolean;
    bom: boolean;
    subassembly: boolean;
    history: boolean;
    users: boolean;
    families: boolean;
}

export interface Role {
    id?: string;
    name: string;
    permissions: RolePermissions;
    createdAt?: any;
    updatedAt?: any;
}