export interface Subassembly {
    id?: string;
    magazine: string;
    partNumber: string;
    quantity: number;
    createdAt?: any;
    updatedAt?: any;
}

export interface SubassemblyMovement {
    id?: string;
    subassemblyId: string;
    magazine: string;
    partNumber: string;
    type: 'entrada' | 'salida';
    quantity: number;
    userId: string;
    userName: string;
    date: any;
}