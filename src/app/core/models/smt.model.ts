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
    userEmail: string;
    date: any;
}