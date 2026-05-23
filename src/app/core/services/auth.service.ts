import { inject, Injectable } from "@angular/core";
import { Auth, signInWithEmailAndPassword, user } from "@angular/fire/auth";
import { doc, Firestore, getDoc, onSnapshot } from "@angular/fire/firestore";
import { Router } from "@angular/router";
import { BehaviorSubject, from, of, switchMap } from "rxjs";
import { RolePermissions } from "../models/role.model";

@Injectable({ providedIn: "root" })
export class AuthService {
    private auth = inject(Auth)
    private firestore = inject(Firestore)
    private router = inject(Router)

    user$ = user(this.auth)

    private permissionsSubject = new BehaviorSubject<RolePermissions | null>(null)
    permissions$ = this.permissionsSubject.asObservable();
    private unsubscribeRole: (() => void) | null = null

    getUserRole(uid: string) {
        const ref = doc(this.firestore, `users/${uid}`)
        return from(getDoc(ref));
    }

    currentUserWithRole$ = this.user$.pipe(
        switchMap(u => u ? this.getUserRole(u.uid) : of(null))
    );

    listenToPermissions(uid: string) {
        if (this.unsubscribeRole) this.unsubscribeRole();

        const userRef = doc(this.firestore, `users/${uid}`);
        this.unsubscribeRole = onSnapshot(userRef, async userSnap => {
            const userData = userSnap.data() as any;

            // Admin siempre tiene acceso total
            if (userData?.role === 'admin') {
                this.permissionsSubject.next({
                    smt: true, bom: true, subassembly: true,
                    history: true, users: true, families: true
                });
                return;
            }

            // Obtener permisos del rol asignado
            const roleId = userData?.roleId;
            if (!roleId) {
                this.permissionsSubject.next(null);
                return;
            }

            const roleRef = doc(this.firestore, `roles/${roleId}`);
            this.unsubscribeRole = onSnapshot(roleRef, roleSnap => {
                const roleData = roleSnap.data() as any;
                this.permissionsSubject.next(roleData?.permissions || null);
            });
        });
    }

    async login(email: string, password: string) {
        const cred = await signInWithEmailAndPassword(this.auth, email, password);
        const snap = await getDoc(doc(this.firestore, `users/${cred.user.uid}`));
        const data = snap.data() as any;

        this.router.navigate(['/dashboard']);
    }

    async logout() {
        if (this.unsubscribeRole) this.unsubscribeRole();
        this.permissionsSubject.next(null);
        await this.auth.signOut();
        this.router.navigate(["/login"]);
    }
}