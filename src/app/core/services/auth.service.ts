import { inject, Injectable } from "@angular/core";
import { Auth, signInWithEmailAndPassword, user } from "@angular/fire/auth";
import { doc, Firestore, getDoc } from "@angular/fire/firestore";
import { Router } from "@angular/router";
import { from, of, switchMap } from "rxjs";

@Injectable({providedIn: "root"})
export class AuthService {
    private auth = inject(Auth)
    private firestore = inject(Firestore)
    private router = inject(Router)

    user$ = user(this.auth)

    getUserRole(uid: string) {
        const ref = doc(this.firestore, `users/${uid}`)
        return from(getDoc(ref));
    }

    currentUserWithRole$ = this.user$.pipe(
        switchMap(u => u ? this.getUserRole(u.uid) : of(null))
    );

    async login(email: string, password: string) {
        const cred = await signInWithEmailAndPassword(this.auth, email, password);
        const snap = await getDoc(doc(this.firestore, `users/${cred.user.uid}`));
        const data = snap.data() as any;

        this.router.navigate(['/dashboard']);
    }

    async logout() {
        await this.auth.signOut();
        this.router.navigate(["/login"]);
    }
}