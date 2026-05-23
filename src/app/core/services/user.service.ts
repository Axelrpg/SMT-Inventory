import { inject, Injectable } from "@angular/core";
import { collection, collectionData, Firestore, orderBy, query } from "@angular/fire/firestore";
import { Functions, httpsCallable } from '@angular/fire/functions';
import { Observable } from "rxjs";
import { AppUser } from "../models/user.model";

@Injectable({ providedIn: 'root' })
export class UserService {
    private firestore = inject(Firestore)
    private functions = inject(Functions);

    getUsers(): Observable<AppUser[]> {
        const colRef = collection(this.firestore, 'users');
        const q = query(colRef, orderBy('displayName', 'asc'));
        return collectionData(q, { idField: 'uid' }) as Observable<AppUser[]>;
    }

    async createUser(data: {
        email: string;
        password: string;
        displayName: string;
        role: string;
        roleId: string;
    }) {
        const fn = httpsCallable(this.functions, 'createUser');
        return fn(data);
    }

    async updateUser(uid: string, data: { email: string; displayName: string; role: string, roleId: string }) {
        const fn = httpsCallable(this.functions, 'updateUser');
        return fn({ uid, ...data });
    }

    async deleteUser(uid: string) {
        const fn = httpsCallable(this.functions, 'deleteUser');
        return fn({ uid });
    }
}