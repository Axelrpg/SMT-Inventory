import { Injectable, inject } from '@angular/core';
import {
    Firestore, collection, collectionData, doc,
    addDoc, updateDoc, deleteDoc, query,
    orderBy, serverTimestamp, getDocs, where,
    getDoc
} from '@angular/fire/firestore';
import { Auth } from '@angular/fire/auth';
import { Observable } from 'rxjs';
import { Bom, BomMovement, BomStockItem } from '../models/bom.model';
import { SmtRoll } from '../models/smt.model';

@Injectable({ providedIn: 'root' })
export class BomService {
    private firestore = inject(Firestore);
    private auth = inject(Auth);

    // ── BOMs ─────────────────────────────────────────────
    getBoms(): Observable<Bom[]> {
        const ref = collection(this.firestore, 'boms');
        const q = query(ref, orderBy('name', 'asc'));
        return collectionData(q, { idField: 'id' }) as Observable<Bom[]>;
    }

    async addBom(bom: Omit<Bom, 'id'>): Promise<string> {
        const ref = collection(this.firestore, 'boms');
        const docRef = await addDoc(ref, {
            ...bom,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
        });
        return docRef.id;
    }

    async updateBom(id: string, data: Partial<Bom>) {
        const ref = doc(this.firestore, `boms/${id}`);
        return updateDoc(ref, { ...data, updatedAt: serverTimestamp() });
    }

    async deleteBom(id: string) {
        const ref = doc(this.firestore, `boms/${id}`);
        return deleteDoc(ref);
    }

    // ── Stock por número de parte ─────────────────────────
    async getRollsByPartNumber(partNumber: string): Promise<SmtRoll[]> {
        const ref = collection(this.firestore, 'smt_rolls');
        const q = query(ref, where('partNumber', '==', partNumber));
        const snap = await getDocs(q);
        return snap.docs.map(d => ({ id: d.id, ...d.data() } as SmtRoll));
    }

    // Verifica stock para todos los items del BOM
    async checkStock(bom: Bom, quantity: number): Promise<BomStockItem[]> {
        const result: BomStockItem[] = [];

        for (const item of bom.items) {
            const rolls = await this.getRollsByPartNumber(item.partNumber);
            const totalStock = rolls.reduce((sum, r) => sum + r.quantity, 0);
            const totalRequired = item.quantityRequired * quantity;

            result.push({
                partNumber: item.partNumber,
                quantityRequired: item.quantityRequired,
                totalRequired,
                rolls: rolls.map(r => ({
                    id: r.id!,
                    location: r.location,
                    stock: r.quantity
                })),
                totalStock,
                hasEnoughStock: totalStock >= totalRequired
            });
        }

        return result;
    }

    // ── Movimientos ──────────────────────────────────────
    getMovements(bomId: string): Observable<BomMovement[]> {
        const ref = collection(this.firestore, 'bom_movements');
        const q = query(ref, where('bomId', '==', bomId), orderBy('date', 'desc'));
        return collectionData(q, { idField: 'id' }) as Observable<BomMovement[]>;
    }

    async registerOutput(
        bom: Bom,
        quantity: number,
        selectedRolls: { partNumber: string; rollId: string; quantity: number }[]
    ) {
        const user = this.auth.currentUser;
        if (!user) throw new Error('No hay usuario autenticado');

        for (const sel of selectedRolls) {
            // Obtener el doc directamente por su referencia
            const rollRef = doc(this.firestore, `smt_rolls/${sel.rollId}`);
            const rollSnap = await getDoc(rollRef);

            if (!rollSnap.exists()) {
                throw new Error(`Rollo ${sel.partNumber} no encontrado`);
            }

            const currentQty = (rollSnap.data() as SmtRoll).quantity;

            // Registrar movimiento SMT
            await addDoc(collection(this.firestore, 'smt_movements'), {
                rollId: sel.rollId,
                partNumber: sel.partNumber,
                type: 'output',
                quantity: sel.quantity,
                userId: user.uid,
                userEmail: user.email,
                date: serverTimestamp()
            });

            // Actualizar stock del rollo
            await updateDoc(rollRef, {
                quantity: currentQty - sel.quantity,
                updatedAt: serverTimestamp()
            });
        }

        // Registrar movimiento BOM
        await addDoc(collection(this.firestore, 'bom_movements'), {
            bomId: bom.id,
            bomName: bom.name,
            type: 'output',
            quantity,
            userId: user.uid,
            userEmail: user.email,
            date: serverTimestamp()
        });
    }
}