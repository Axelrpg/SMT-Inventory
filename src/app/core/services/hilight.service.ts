import { Injectable, inject } from '@angular/core';
import {
    Firestore, collection, collectionData, doc,
    addDoc, updateDoc, deleteDoc, query, where,
    orderBy, serverTimestamp, getDoc, getDocs,
    limit, startAfter, QueryDocumentSnapshot
} from '@angular/fire/firestore';
import { Auth } from '@angular/fire/auth';
import { Observable } from 'rxjs';
import { HilightRoll, HilightMovement } from '../models/hilight.model';

@Injectable({ providedIn: 'root' })
export class HilightService {
    private firestore = inject(Firestore);
    private auth = inject(Auth);

    // ── Paginado ─────────────────────────────────────────
    async getRollsPaginated(
        pageSize: number,
        lastDoc?: QueryDocumentSnapshot
    ): Promise<{ rolls: HilightRoll[], lastDoc: QueryDocumentSnapshot | null }> {
        const ref = collection(this.firestore, 'hilight_rolls');
        const q = lastDoc
            ? query(ref, orderBy('updatedAt', 'desc'), startAfter(lastDoc), limit(pageSize))
            : query(ref, orderBy('updatedAt', 'desc'), limit(pageSize));
        const snap = await getDocs(q);
        const rolls = snap.docs.map(d => ({ id: d.id, ...d.data() } as HilightRoll));
        const last = snap.docs.length > 0 ? snap.docs[snap.docs.length - 1] : null;
        return { rolls, lastDoc: last };
    }

    async getRollsNextPage(pageSize: number, lastDoc: QueryDocumentSnapshot): Promise<{ rolls: HilightRoll[], lastDoc: QueryDocumentSnapshot | null }> {
        const ref = collection(this.firestore, 'hilight_rolls');
        const q = query(ref, orderBy('updatedAt', 'desc'), startAfter(lastDoc), limit(pageSize));
        const snap = await getDocs(q);
        const rolls = snap.docs.map(d => ({ id: d.id, ...d.data() } as HilightRoll));
        const lastDoc2 = snap.docs.length > 0 ? snap.docs[snap.docs.length - 1] : null;
        return { rolls: rolls, lastDoc: lastDoc2 };
    }

    async getAllRolls(): Promise<HilightRoll[]> {
        const ref = collection(this.firestore, 'hilight_rolls');
        const q = query(ref, orderBy('updatedAt', 'desc'));
        const snap = await getDocs(q);
        return snap.docs.map(d => ({ id: d.id, ...d.data() } as HilightRoll));
    }

    async getRollsByPartNumber(partNumber: string): Promise<HilightRoll[]> {
        const ref = collection(this.firestore, 'hilight_rolls');
        const q = query(ref, where('partNumber', '==', partNumber));
        const snap = await getDocs(q);
        return snap.docs.map(d => ({ id: d.id, ...d.data() } as HilightRoll));
    }

    async addRoll(roll: Omit<HilightRoll, 'id'>): Promise<string> {
        const ref = collection(this.firestore, 'hilight_rolls');
        const docRef = await addDoc(ref, {
            ...roll,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
        });
        return docRef.id;
    }

    async updateRoll(id: string, data: Partial<HilightRoll>) {
        const ref = doc(this.firestore, `hilight_rolls/${id}`);
        return updateDoc(ref, { ...data, updatedAt: serverTimestamp() });
    }

    async deleteRoll(id: string) {
        const ref = doc(this.firestore, `hilight_rolls/${id}`);
        return deleteDoc(ref);
    }

    // ── Movimientos ──────────────────────────────────────
    getMovements(rollId: string): Observable<HilightMovement[]> {
        const ref = collection(this.firestore, 'hilight_movements');
        const q = query(ref,
            where('rollId', '==', rollId),
            orderBy('date', 'desc')
        );
        return collectionData(q, { idField: 'id' }) as Observable<HilightMovement[]>;
    }

    async getMovementsPaginated(
        pageSize: number,
        lastDoc?: QueryDocumentSnapshot
    ): Promise<{ movements: HilightMovement[], lastDoc: QueryDocumentSnapshot | null }> {
        const ref = collection(this.firestore, 'hilight_movements');
        const q = lastDoc
            ? query(ref, orderBy('date', 'desc'), startAfter(lastDoc), limit(pageSize))
            : query(ref, orderBy('date', 'desc'), limit(pageSize));
        const snap = await getDocs(q);
        const movements = snap.docs.map(d => ({ id: d.id, ...d.data() } as HilightMovement));
        const last = snap.docs.length > 0 ? snap.docs[snap.docs.length - 1] : null;
        return { movements, lastDoc: last };
    }

    async getAllMovementsOnce(): Promise<HilightMovement[]> {
        const ref = collection(this.firestore, 'hilight_movements');
        const q = query(ref, orderBy('date', 'desc'));
        const snap = await getDocs(q);
        return snap.docs.map(d => ({ id: d.id, ...d.data() } as HilightMovement));
    }

    async registerMovement(
        rollId: string,
        partNumber: string,
        type: 'input' | 'output',
        length: number
    ) {
        const user = this.auth.currentUser;
        if (!user) throw new Error('No hay usuario autenticado');

        await addDoc(collection(this.firestore, 'hilight_movements'), {
            rollId, partNumber, type, length,
            userId: user.uid,
            userName: user.displayName || user.email,
            date: serverTimestamp()
        });

        const rollRef = doc(this.firestore, `hilight_rolls/${rollId}`);
        const rollSnap = await getDoc(rollRef);
        const currentLength = (rollSnap.data() as HilightRoll).length;
        const newLength = type === 'input'
            ? currentLength + length
            : currentLength - length;

        await updateDoc(rollRef, { length: newLength, updatedAt: serverTimestamp() });
    }
}