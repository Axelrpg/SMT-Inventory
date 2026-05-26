export interface HilightRoll {
    id?: string;
    partNumber: string;
    length: number;      // en metros
    location: string;
    createdAt?: any;
    updatedAt?: any;
}

export interface HilightMovement {
    id?: string;
    rollId: string;
    partNumber: string;
    type: 'input' | 'output';
    length: number;
    userId: string;
    userName: string;
    date: any;
}