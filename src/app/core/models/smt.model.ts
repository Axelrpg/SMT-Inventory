export interface SmtRoll {
    id?: string;
    partNumber: string;
    quantity: number;
    location: string;
    createdAt?: any;
    updatedAt?: any;
}

export interface SmtMovement {
    id?: string;
    rollId: string;
    partNumber: string;
    type: 'entrada' | 'salida';
    quantity: number;
    userId: string;
    userName: string;
    date: any;
}

export interface BulkInputItem {
    partNumber: string;
    quantity: number;
    location: string;
}

export interface BulkOutputItem {
    rollId: string;
    partNumber: string;
    location: string;
    quantity: number;
    maxQuantity: number;
}