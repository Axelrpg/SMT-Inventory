import { inject, Injectable } from "@angular/core";
import { Auth } from "@angular/fire/auth";
import { addDoc, collection, collectionData, deleteDoc, doc, Firestore, getDoc, orderBy, query, serverTimestamp, updateDoc, where } from "@angular/fire/firestore";
import { Observable } from "rxjs";
import { SmtMovement, SmtRoll } from "../models/smt.model";

@Injectable({ providedIn: "root" })
export class SmtService {
    private firestore = inject(Firestore);
    private auth = inject(Auth);

    getRolls(): Observable<SmtRoll[]> {
        const ref = collection(this.firestore, "smt_rolls");
        const q = query(ref, orderBy("location", "asc"));
        return collectionData(q, { idField: "id" }) as Observable<SmtRoll[]>;
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

        const movRef = collection(this.firestore, 'smt_movements');
        await addDoc(movRef, {
            rollId, partNumber, type, quantity,
            userId: user.uid,
            userEmail: user.email,
            date: serverTimestamp()
        });

        const rollRef = doc(this.firestore, `smt_rolls/${rollId}`);
        const rollSnap = await getDoc(rollRef);
        const currentQty = (rollSnap.data() as SmtRoll).quantity;
        const newQty = type === 'entrada' ? currentQty + quantity : currentQty - quantity;
        await updateDoc(rollRef, { quantity: newQty, updatedAt: serverTimestamp() });
    }
}