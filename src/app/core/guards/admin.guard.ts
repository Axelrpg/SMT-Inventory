import { inject } from "@angular/core";
import { CanActivateFn, Router } from "@angular/router";
import { AuthService } from "../services/auth.service";
import { map, take } from "rxjs";

export const adminGuard: CanActivateFn = () => {
    const auth = inject(AuthService);
    const router = inject(Router);
    return auth.currentUserWithRole$.pipe(
        take(1),
        map(snap => {
            const role = (snap as any)?.data()?.role;
            return role === "admin" ? true : router.createUrlTree(["/dashboard"]);
        })
    )
}