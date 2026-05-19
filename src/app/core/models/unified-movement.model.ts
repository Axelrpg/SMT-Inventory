export interface UnifiedMovement {
    id?: string;
    source: 'smt' | 'bom' | 'subassembly';
    type: 'entrada' | 'salida';
    partNumber?: string;
    bomName?: string;
    magazine?: string;
    quantity: number;
    userId: string;
    userName: string;
    date: any;
}