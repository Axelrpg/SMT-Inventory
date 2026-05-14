import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';

export const routes: Routes = [
    { path: '', redirectTo: 'login', pathMatch: 'full' },
    { path: 'login', loadComponent: () => import('./pages/login-component/login-component').then(m => m.LoginComponent) },
    { path: 'dashboard', loadComponent: () => import('./pages/dashboard-component/dashboard-component').then(m => m.DashboardComponent), canActivate: [authGuard] },
    { path: '**', redirectTo: 'login' }
];
