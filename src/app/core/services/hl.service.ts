import { Injectable, inject } from '@angular/core';
import {
    Firestore, collection, collectionData, doc,
    addDoc, updateDoc, deleteDoc, query,
    orderBy, serverTimestamp, getDocs, where,
    getDoc,
    limit,
    QueryDocumentSnapshot,
    startAfter
} from '@angular/fire/firestore';
import { Auth } from '@angular/fire/auth';
import { Observable } from 'rxjs';
import { HL, HLMovement, HLStockItem } from '../models/hl.model';
import { HilightRoll } from '../models/hilight.model';

@Injectable({ providedIn: 'root' })
export class HLService {
    private firestore = inject(Firestore);
    private auth = inject(Auth);

    // ── HLs ─────────────────────────────────────────────
    getHls(): Observable<HL[]> {
        const ref = collection(this.firestore, 'hls');
        const q = query(ref, orderBy('name', 'asc'));
        return collectionData(q, { idField: 'id' }) as Observable<HL[]>;
    }

    // Paginado de HLs
    async getHlsPaginated(
        pageSize: number,
        lastDoc?: QueryDocumentSnapshot
    ): Promise<{ hls: HL[], lastDoc: QueryDocumentSnapshot | null }> {
        const ref = collection(this.firestore, 'hls');
        const q = lastDoc
            ? query(ref, orderBy('name', 'asc'), startAfter(lastDoc), limit(pageSize))
            : query(ref, orderBy('name', 'asc'), limit(pageSize));

        const snap = await getDocs(q);
        const hls = snap.docs.map(d => ({ id: d.id, ...d.data() } as HL));
        const last = snap.docs.length > 0 ? snap.docs[snap.docs.length - 1] : null;
        return { hls, lastDoc: last };
    }

    // Búsqueda de HLs por nombre
    async searchHlsByName(name: string): Promise<HL[]> {
        const ref = collection(this.firestore, 'hls');
        const q = query(
            ref,
            where('name', '>=', name),
            where('name', '<=', name + '\uf8ff'),
            orderBy('name', 'asc')
        );
        const snap = await getDocs(q);
        return snap.docs.map(d => ({ id: d.id, ...d.data() } as HL));
    }

    // Paginado de números de parte Hilight para el buscador del HL
    async getPartNumbersPaginated(
        pageSize: number,
        lastDoc?: QueryDocumentSnapshot
    ): Promise<{ rolls: HilightRoll[], lastDoc: QueryDocumentSnapshot | null }> {
        const ref = collection(this.firestore, 'hilight_rolls');
        const q = lastDoc
            ? query(ref, orderBy('partNumber', 'asc'), startAfter(lastDoc), limit(pageSize))
            : query(ref, orderBy('partNumber', 'asc'), limit(pageSize));

        const snap = await getDocs(q);
        const rolls = snap.docs.map(d => ({ id: d.id, ...d.data() } as HilightRoll));
        const last = snap.docs.length > 0 ? snap.docs[snap.docs.length - 1] : null;
        return { rolls, lastDoc: last };
    }

    // Búsqueda de números de parte Hilight
    async searchPartNumbers(partNumber: string): Promise<HilightRoll[]> {
        const ref = collection(this.firestore, 'hilight_rolls');
        const q = query(
            ref,
            where('partNumber', '>=', partNumber),
            where('partNumber', '<=', partNumber + '\uf8ff'),
            orderBy('partNumber', 'asc'),
            limit(5)
        );
        const snap = await getDocs(q);
        return snap.docs.map(d => ({ id: d.id, ...d.data() } as HilightRoll));
    }

    async getMovementsPaginated(
        pageSize: number,
        lastDoc?: QueryDocumentSnapshot
    ): Promise<{ movements: HLMovement[], lastDoc: QueryDocumentSnapshot | null }> {
        const ref = collection(this.firestore, 'hl_movements');
        const q = lastDoc
            ? query(ref, orderBy('date', 'desc'), startAfter(lastDoc), limit(pageSize))
            : query(ref, orderBy('date', 'desc'), limit(pageSize));

        const snap = await getDocs(q);
        const movements = snap.docs.map(d => ({ id: d.id, ...d.data() } as HLMovement));
        const last = snap.docs.length > 0 ? snap.docs[snap.docs.length - 1] : null;
        return { movements, lastDoc: last };
    }

    async getHlsByPartNumber(partNumber: string): Promise<HL[]> {
        const ref = collection(this.firestore, 'hls');
        const snap = await getDocs(query(ref, orderBy('name', 'asc')));
        const allHls = snap.docs.map(d => ({ id: d.id, ...d.data() } as HL));
        // Filtrar los que tienen ese número de parte en su receta
        return allHls.filter(h =>
            h.items.some(i => i.partNumber.toLowerCase().includes(partNumber.toLowerCase()))
        );
    }

    async addHL(hl: Omit<HL, 'id'>): Promise<string> {
        const ref = collection(this.firestore, 'hls');
        const docRef = await addDoc(ref, {
            ...hl,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
        });
        return docRef.id;
    }

    async updateHL(id: string, data: Partial<HL>) {
        const ref = doc(this.firestore, `hls/${id}`);
        return updateDoc(ref, { ...data, updatedAt: serverTimestamp() });
    }

    async deleteHL(id: string) {
        const ref = doc(this.firestore, `hls/${id}`);
        return deleteDoc(ref);
    }

    // ── Stock por número de parte ─────────────────────────
    async getRollsByPartNumber(partNumber: string): Promise<HilightRoll[]> {
        const ref = collection(this.firestore, 'hilight_rolls');
        const q = query(ref, where('partNumber', '==', partNumber));
        const snap = await getDocs(q);
        return snap.docs.map(d => ({ id: d.id, ...d.data() } as HilightRoll));
    }

    // Verifica stock para todos los items del HL
    async checkStock(hl: HL, length: number): Promise<HLStockItem[]> {
        const result: HLStockItem[] = [];

        for (const item of hl.items) {
            const rolls = await this.getRollsByPartNumber(item.partNumber);
            const totalLength = rolls.reduce((sum, r) => sum + r.length, 0);
            const totalRequired = item.lengthRequired * length;

            result.push({
                partNumber: item.partNumber,
                lengthRequired: item.lengthRequired,
                totalRequired,
                rolls: rolls.map(r => ({
                    id: r.id!,
                    location: r.location,
                    length: r.length
                })),
                totalLength,
                hasEnoughLength: totalLength >= totalRequired
            });
        }

        return result;
    }

    // ── Movimientos ──────────────────────────────────────    
    getMovements(hlId: string): Observable<HLMovement[]> {
        const ref = collection(this.firestore, 'hl_movements');
        const q = query(ref, where('hlId', '==', hlId), orderBy('date', 'desc'));
        return collectionData(q, { idField: 'id' }) as Observable<HLMovement[]>;
    }

    async registerOutput(
        hl: HL,
        length: number,
        selectedRolls: { partNumber: string; rollId: string; length: number }[]
    ) {
        const user = this.auth.currentUser;
        if (!user) throw new Error('No hay usuario autenticado');

        for (const sel of selectedRolls) {
            // Obtener el doc directamente por su referencia
            const rollRef = doc(this.firestore, `hilight_rolls/${sel.rollId}`);
            const rollSnap = await getDoc(rollRef);

            if (!rollSnap.exists()) {
                throw new Error(`Rollo ${sel.partNumber} no encontrado`);
            }

            const currentQty = (rollSnap.data() as HilightRoll).length;

            // Registrar movimiento Hilight
            await addDoc(collection(this.firestore, 'hilight_movements'), {
                rollId: sel.rollId,
                partNumber: sel.partNumber,
                type: 'output',
                length: sel.length,
                userId: user.uid,
                userName: user.displayName || user.email,
                date: serverTimestamp()
            });

            // Actualizar stock del rollo
            await updateDoc(rollRef, {
                length: currentQty - sel.length,
                updatedAt: serverTimestamp()
            });
        }

        // Registrar movimiento HL
        await addDoc(collection(this.firestore, 'hl_movements'), {
            hlId: hl.id,
            hlName: hl.name,
            type: 'output',
            quantity: length,
            userId: user.uid,
            userName: user.displayName || user.email,
            date: serverTimestamp()
        });
    }

    // ── Exportación ───────────────────────────────────────
    async getAllHls(): Promise<HL[]> {
        const ref = collection(this.firestore, 'hls');
        const q = query(ref, orderBy('name', 'asc'));
        const snap = await getDocs(q);
        return snap.docs.map(d => ({ id: d.id, ...d.data() } as HL));
    }

    async getAllMovementsOnce(): Promise<HLMovement[]> {
        const ref = collection(this.firestore, 'hilight_movements');
        const q = query(ref, orderBy('date', 'desc'));
        const snap = await getDocs(q);
        return snap.docs.map(d => ({ id: d.id, ...d.data() } as HLMovement));
    }
}