export interface UnifiedMovement {
    id?: string;
    source: 'smt' | 'bom';
    type: 'input' | 'output';
    partNumber?: string;
    bomName?: string;
    quantity: number;
    userId: string;
    userEmail: string;
    date: any;
}