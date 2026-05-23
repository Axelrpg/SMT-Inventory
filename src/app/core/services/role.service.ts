import { Injectable, inject } from '@angular/core';
import {
    Firestore, collection, doc,
    addDoc, updateDoc, deleteDoc,
    query, orderBy, getDocs,
    serverTimestamp, getDoc
} from '@angular/fire/firestore';
import { Role } from '../models/role.model';

@Injectable({ providedIn: 'root' })
export class RoleService {
    private firestore = inject(Firestore);

    async getAll(): Promise<Role[]> {
        const ref = collection(this.firestore, 'roles');
        const q = query(ref, orderBy('name', 'asc'));
        const snap = await getDocs(q);
        return snap.docs.map(d => ({ id: d.id, ...d.data() } as Role));
    }

    async getById(id: string): Promise<Role | null> {
        const ref = doc(this.firestore, `roles/${id}`);
        const snap = await getDoc(ref);
        if (!snap.exists()) return null;
        return { id: snap.id, ...snap.data() } as Role;
    }

    async add(role: Omit<Role, 'id'>): Promise<string> {
        const ref = collection(this.firestore, 'roles');
        const docRef = await addDoc(ref, {
            ...role,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
        });
        return docRef.id;
    }

    async update(id: string, data: Partial<Role>) {
        const ref = doc(this.firestore, `roles/${id}`);
        return updateDoc(ref, { ...data, updatedAt: serverTimestamp() });
    }

    async delete(id: string) {
        const ref = doc(this.firestore, `roles/${id}`);
        return deleteDoc(ref);
    }
}