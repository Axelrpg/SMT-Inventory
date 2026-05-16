import { inject, Injectable } from "@angular/core";
import { Auth } from "@angular/fire/auth";
import { addDoc, collection, collectionData, deleteDoc, doc, Firestore, getDoc, getDocs, limit, orderBy, query, QueryDocumentSnapshot, serverTimestamp, startAfter, updateDoc, where } from "@angular/fire/firestore";
import { Observable } from "rxjs";
import { SmtMovement, SmtRoll } from "../models/smt.model";

@Injectable({ providedIn: "root" })
export class SmtService {
    private firestore = inject(Firestore);
    private auth = inject(Auth);

    async getRollsPaginated(pageSize: number): Promise<{ rolls: SmtRoll[], lastDoc: QueryDocumentSnapshot | null }> {
        const ref = collection(this.firestore, 'smt_rolls');
        const q = query(ref, orderBy('updatedAt', 'desc'), limit(pageSize));
        const snap = await getDocs(q);
        const rolls = snap.docs.map(d => ({ id: d.id, ...d.data() } as SmtRoll));
        const lastDoc = snap.docs.length > 0 ? snap.docs[snap.docs.length - 1] : null;
        return { rolls, lastDoc };
    }

    async getRollsNextPage(pageSize: number, lastDoc: QueryDocumentSnapshot): Promise<{ rolls: SmtRoll[], lastDoc: QueryDocumentSnapshot | null }> {
        const ref = collection(this.firestore, 'smt_rolls');
        const q = query(ref, orderBy('updatedAt', 'desc'), startAfter(lastDoc), limit(pageSize));
        const snap = await getDocs(q);
        const rolls = snap.docs.map(d => ({ id: d.id, ...d.data() } as SmtRoll));
        const lastDoc2 = snap.docs.length > 0 ? snap.docs[snap.docs.length - 1] : null;
        return { rolls: rolls, lastDoc: lastDoc2 };
    }

    async searchRollsByPartNumber(partNumber: string): Promise<SmtRoll[]> {
        const ref = collection(this.firestore, 'smt_rolls');
        const q = query(
            ref,
            where('partNumber', '>=', partNumber.toUpperCase()),
            where('partNumber', '<=', partNumber.toUpperCase() + '\uf8ff'),
            orderBy('partNumber', 'asc')
        );
        const snap = await getDocs(q);
        return snap.docs.map(d => ({ id: d.id, ...d.data() } as SmtRoll));
    }

    async getRollByPartNumber(partNumber: string): Promise<SmtRoll | null> {
        const ref = collection(this.firestore, "smt_rolls")
        const q = query(ref, where("partNumber", "==", partNumber));
        const { getDocs } = await import("firebase/firestore");
        const querySnapshot = await getDocs(q);
        if (querySnapshot.empty) {
            return null;
        }
        const d = querySnapshot.docs[0]
        return { id: d.id, ...d.data() } as SmtRoll;
    }

    async getRollsByPartNumber(partNumber: string): Promise<SmtRoll[]> {
        const ref = collection(this.firestore, 'smt_rolls')
        const { getDocs, query, where } = await import('@angular/fire/firestore');
        const q = query(ref, where('partNumber', '==', partNumber));
        const querySnapshot = await getDocs(q);
        if (querySnapshot.empty) {
            return [];
        }
        return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as SmtRoll));
    }

    async getMovementsPaginated(
        pageSize: number,
        lastDoc?: QueryDocumentSnapshot
    ): Promise<{ movements: SmtMovement[], lastDoc: QueryDocumentSnapshot | null }> {
        const ref = collection(this.firestore, 'smt_movements');
        const q = lastDoc
            ? query(ref, orderBy('date', 'desc'), startAfter(lastDoc), limit(pageSize))
            : query(ref, orderBy('date', 'desc'), limit(pageSize));

        const snap = await getDocs(q);
        const movements = snap.docs.map(d => ({ id: d.id, ...d.data() } as SmtMovement));
        const last = snap.docs.length > 0 ? snap.docs[snap.docs.length - 1] : null;
        return { movements, lastDoc: last };
    }

    async addRoll(roll: Omit<SmtRoll, 'id'>): Promise<string> {
        const ref = collection(this.firestore, 'smt_rolls');
        const docRef = await addDoc(ref, { ...roll, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
        return docRef.id;
    }

    async updateRoll(id: string, data: Partial<SmtRoll>) {
        const ref = doc(this.firestore, `smt_rolls/${id}`);
        return updateDoc(ref, { ...data, updatedAt: serverTimestamp() });
    }

    async deleteRoll(id: string) {
        const ref = doc(this.firestore, `smt_rolls/${id}`);
        return deleteDoc(ref);
    }

    getMovements(rollId: string): Observable<SmtMovement[]> {
        const ref = collection(this.firestore, 'smt_movements');
        const q = query(ref, where('rollId', '==', rollId), orderBy('date', 'desc'));
        return collectionData(q, { idField: 'id' }) as Observable<SmtMovement[]>;
    }

    async registerMovement(rollId: string, partNumber: string, type: 'entrada' | 'salida', quantity: number) {
        const user = this.auth.currentUser;
        if (!user) throw new Error('No hay usuario autenticado');

        // Registrar movimiento
        const movRef = collection(this.firestore, 'smt_movements');
        await addDoc(movRef, {
            rollId, partNumber, type, quantity,
            userId: user.uid,
            userEmail: user.email,
            date: serverTimestamp()
        });

        // Leer el stock ACTUAL antes de modificar
        const rollRef = doc(this.firestore, `smt_rolls/${rollId}`);
        const rollSnap = await getDoc(rollRef);   // ← debe ser getDoc, no depender del observable
        const currentQty = (rollSnap.data() as SmtRoll).quantity;

        const newQty = type === 'entrada'
            ? currentQty + quantity
            : currentQty - quantity;

        await updateDoc(rollRef, {
            quantity: newQty,
            updatedAt: serverTimestamp()
        });
    }

    // ── Métodos para exportar a Excel ─────────────────────────────────
    async getAllRolls(): Promise<SmtRoll[]> {
        const ref = collection(this.firestore, 'smt_rolls');
        const q = query(ref, orderBy('updatedAt', 'desc'));
        const snap = await getDocs(q);
        return snap.docs.map(d => ({ id: d.id, ...d.data() } as SmtRoll));
    }

    async getAllMovementsOnce(): Promise<SmtMovement[]> {
        const ref = collection(this.firestore, 'smt_movements');
        const q = query(ref, orderBy('date', 'desc'));
        const snap = await getDocs(q);
        return snap.docs.map(d => ({ id: d.id, ...d.data() } as SmtMovement));
    }
}