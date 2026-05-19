import { Injectable, inject } from '@angular/core';
import {
    Firestore, collection, collectionData, doc,
    addDoc, updateDoc, deleteDoc, query, where,
    orderBy, serverTimestamp, getDoc, getDocs,
    limit, startAfter, QueryDocumentSnapshot
} from '@angular/fire/firestore';
import { Auth } from '@angular/fire/auth';
import { Observable } from 'rxjs';
import { Subassembly, SubassemblyMovement } from '../models/subassembly.model';

@Injectable({ providedIn: 'root' })
export class SubassemblyService {
    private firestore = inject(Firestore);
    private auth = inject(Auth);

    // ── Paginado ─────────────────────────────────────────
    async getPaginated(
        pageSize: number,
        lastDoc?: QueryDocumentSnapshot
    ): Promise<{ items: Subassembly[], lastDoc: QueryDocumentSnapshot | null }> {
        const ref = collection(this.firestore, 'subassemblies');
        const q = lastDoc
            ? query(ref, orderBy('updatedAt', 'desc'), startAfter(lastDoc), limit(pageSize))
            : query(ref, orderBy('updatedAt', 'desc'), limit(pageSize));
        const snap = await getDocs(q);
        const items = snap.docs.map(d => ({ id: d.id, ...d.data() } as Subassembly));
        const last = snap.docs.length > 0 ? snap.docs[snap.docs.length - 1] : null;
        return { items, lastDoc: last };
    }

    async getAll(): Promise<Subassembly[]> {
        const ref = collection(this.firestore, 'subassemblies');
        const q = query(ref, orderBy('updatedAt', 'desc'));
        const snap = await getDocs(q);
        return snap.docs.map(d => ({ id: d.id, ...d.data() } as Subassembly));
    }

    // ── Búsqueda ─────────────────────────────────────────
    async getByMagazine(magazine: string): Promise<Subassembly | null> {
        const ref = collection(this.firestore, 'subassemblies');
        const q = query(ref, where('magazine', '==', magazine));
        const snap = await getDocs(q);
        if (snap.empty) return null;
        const d = snap.docs[0];
        return { id: d.id, ...d.data() } as Subassembly;
    }

    async getByPartNumber(partNumber: string): Promise<Subassembly[]> {
        const ref = collection(this.firestore, 'subassemblies');
        const q = query(ref, where('partNumber', '==', partNumber));
        const snap = await getDocs(q);
        return snap.docs.map(d => ({ id: d.id, ...d.data() } as Subassembly));
    }

    // ── CRUD ─────────────────────────────────────────────
    async add(item: Omit<Subassembly, 'id'>): Promise<string> {
        const ref = collection(this.firestore, 'subassemblies');
        const docRef = await addDoc(ref, {
            ...item,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
        });
        return docRef.id;
    }

    async update(id: string, data: Partial<Subassembly>) {
        const ref = doc(this.firestore, `subassemblies/${id}`);
        return updateDoc(ref, { ...data, updatedAt: serverTimestamp() });
    }

    async delete(id: string) {
        const ref = doc(this.firestore, `subassemblies/${id}`);
        return deleteDoc(ref);
    }

    // ── Movimientos ──────────────────────────────────────
    getMovements(subassemblyId: string): Observable<SubassemblyMovement[]> {
        const ref = collection(this.firestore, 'subassembly_movements');
        const q = query(ref,
            where('subassemblyId', '==', subassemblyId),
            orderBy('date', 'desc')
        );
        return collectionData(q, { idField: 'id' }) as Observable<SubassemblyMovement[]>;
    }

    async getMovementsPaginated(
        pageSize: number,
        lastDoc?: QueryDocumentSnapshot
    ): Promise<{ movements: SubassemblyMovement[], lastDoc: QueryDocumentSnapshot | null }> {
        const ref = collection(this.firestore, 'subassembly_movements');
        const q = lastDoc
            ? query(ref, orderBy('date', 'desc'), startAfter(lastDoc), limit(pageSize))
            : query(ref, orderBy('date', 'desc'), limit(pageSize));
        const snap = await getDocs(q);
        const movements = snap.docs.map(d => ({ id: d.id, ...d.data() } as SubassemblyMovement));
        const last = snap.docs.length > 0 ? snap.docs[snap.docs.length - 1] : null;
        return { movements, lastDoc: last };
    }

    async getAllMovementsOnce(): Promise<SubassemblyMovement[]> {
        const ref = collection(this.firestore, 'subassembly_movements');
        const q = query(ref, orderBy('date', 'desc'));
        const snap = await getDocs(q);
        return snap.docs.map(d => ({ id: d.id, ...d.data() } as SubassemblyMovement));
    }

    async registerMovement(
        subassemblyId: string,
        magazine: string,
        partNumber: string,
        type: 'entrada' | 'salida',
        quantity: number
    ) {
        const user = this.auth.currentUser;
        if (!user) throw new Error('No hay usuario autenticado');

        await addDoc(collection(this.firestore, 'subassembly_movements'), {
            subassemblyId, magazine, partNumber, type, quantity,
            userId: user.uid,
            userName: user.displayName || user.email,
            date: serverTimestamp()
        });

        const ref = doc(this.firestore, `subassemblies/${subassemblyId}`);
        const snap = await getDoc(ref);
        const currentQty = (snap.data() as Subassembly).quantity;
        const newQty = type === 'entrada' ? currentQty + quantity : currentQty - quantity;
        await updateDoc(ref, { quantity: newQty, updatedAt: serverTimestamp() });
    }
}