export interface HLItem {
    partNumber: string;
    lengthRequired: number;
    existsInHilight?: boolean;
}

export interface HL {
    id?: string;
    name: string;
    description?: string;
    items: HLItem[];
    createdAt?: any;
    updatedAt?: any;
}

export interface HLMovement {
    id?: string;
    hlId: string;
    hlName: string;
    type: 'input' | 'output';
    quantity: number; // cuantos HLs se produjeron
    userId: string;
    userName: string;
    date: any;
}

export interface HLStockItem {
    partNumber: string;
    lengthRequired: number;   // por HL
    totalRequired: number;      // lengthRequired * HLs a producir
    rolls: {
        id: string;
        location: string;
        length: number;
    }[];
    totalLength: number;
    hasEnoughLength: boolean;
}