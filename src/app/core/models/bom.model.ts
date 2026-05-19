export interface BomItem {
    partNumber: string;
    quantityRequired: number;
    existsInSmt?: boolean;
}

export interface Bom {
    id?: string;
    name: string;
    description?: string;
    items: BomItem[];
    createdAt?: any;
    updatedAt?: any;
}

export interface BomMovement {
    id?: string;
    bomId: string;
    bomName: string;
    type: 'entrada' | 'salida';
    quantity: number; // cuantos BOMs se produjeron
    userId: string;
    userName: string;
    date: any;
}

export interface BomStockItem {
    partNumber: string;
    quantityRequired: number;   // por BOM
    totalRequired: number;      // quantityRequired * BOMs a producir
    rolls: {
        id: string;
        location: string;
        stock: number;
    }[];
    totalStock: number;
    hasEnoughStock: boolean;
}