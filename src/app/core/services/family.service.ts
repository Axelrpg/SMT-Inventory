import { Injectable, inject } from '@angular/core';
import {
    Firestore, collection, doc,
    addDoc, updateDoc, deleteDoc, query,
    orderBy, serverTimestamp, getDocs, where,
    limit, startAfter, QueryDocumentSnapshot
} from '@angular/fire/firestore';
import { Family } from '../models/family.model';

@Injectable({ providedIn: 'root' })
export class FamilyService {
    private firestore = inject(Firestore);

    async getPaginated(
        pageSize: number,
        lastDoc?: QueryDocumentSnapshot
    ): Promise<{ items: Family[], lastDoc: QueryDocumentSnapshot | null }> {
        const ref = collection(this.firestore, 'families');
        const q = lastDoc
            ? query(ref, orderBy('name', 'asc'), startAfter(lastDoc), limit(pageSize))
            : query(ref, orderBy('name', 'asc'), limit(pageSize));
        const snap = await getDocs(q);
        const items = snap.docs.map(d => ({ id: d.id, ...d.data() } as Family));
        const last = snap.docs.length > 0 ? snap.docs[snap.docs.length - 1] : null;
        return { items, lastDoc: last };
    }

    async getAll(): Promise<Family[]> {
        const ref = collection(this.firestore, 'families');
        const q = query(ref, orderBy('name', 'asc'));
        const snap = await getDocs(q);
        return snap.docs.map(d => ({ id: d.id, ...d.data() } as Family));
    }

    async getByPartNumber(partNumber: string): Promise<Family | null> {
        const ref = collection(this.firestore, 'families');
        const q = query(ref, where('partNumber', '==', partNumber));
        const snap = await getDocs(q);
        if (snap.empty) return null;
        return { id: snap.docs[0].id, ...snap.docs[0].data() } as Family;
    }

    async add(family: Omit<Family, 'id'>): Promise<string> {
        const ref = collection(this.firestore, 'families');
        const docRef = await addDoc(ref, {
            ...family,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
        });
        return docRef.id;
    }

    async update(id: string, data: Partial<Family>) {
        const ref = doc(this.firestore, `families/${id}`);
        return updateDoc(ref, { ...data, updatedAt: serverTimestamp() });
    }

    async delete(id: string) {
        const ref = doc(this.firestore, `families/${id}`);
        return deleteDoc(ref);
    }
}