import { Component, inject, OnInit, ChangeDetectorRef, HostListener } from '@angular/core';
import { AuthService } from '../../core/services/auth.service';
import { RolePermissions } from '../../core/models/role.model';
import { UsersComponent } from './tabs/users-component/users-component';
import { SmtComponent } from './tabs/smt-component/smt-component';
import { BomComponent } from './tabs/bom-component/bom-component';
import { SubassemblyComponent } from './tabs/subassembly-component/subassembly-component';
import { FamiliesComponent } from './tabs/families-component/families-component';
import { HistoryComponent } from './tabs/history-component/history-component';
import { RolesComponent } from './tabs/roles-component/roles-component';
import { HilightComponent } from './tabs/hilight-component/hilight-component';
import { HlComponent } from './tabs/hl-component/hl-component';

type Tab = 'smt' | 'bom' | 'subassembly' | 'hilight' | 'hl' | 'history' | 'users' | 'families' | 'roles';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    UsersComponent, SmtComponent, BomComponent, SubassemblyComponent, HilightComponent, HlComponent,
    FamiliesComponent, HistoryComponent, RolesComponent
  ],
  templateUrl: './dashboard-component.html',
  styleUrl: './dashboard-component.css'
})
export class DashboardComponent implements OnInit {
  private authService = inject(AuthService);
  private cdr = inject(ChangeDetectorRef);

  isAdmin = false;
  activeTab: Tab = 'smt';
  permissions: RolePermissions | null = null;
  sidebarOpen = false;
  userName = '';

  async ngOnInit() {
    this.authService.currentUserWithRole$.subscribe(snap => {
      const data = (snap as any)?.data();
      this.isAdmin = data?.role === 'admin';
      this.userName = data?.displayName || data?.email || '';
      this.cdr.detectChanges();
    });

    this.authService.permissions$.subscribe(perms => {
      this.permissions = perms;

      // Si el tab activo ya no tiene permiso, cambiar al primero disponible
      if (!this.canView(this.activeTab)) {
        const first = this.getFirstAllowedTab();
        if (first) this.activeTab = first;
      }
      this.cdr.detectChanges();
    });

    // Iniciar escucha de permisos
    this.authService.user$.subscribe(u => {
      if (u) this.authService.listenToPermissions(u.uid);
    });
  }

  canView(tab: Tab): boolean {
    if (this.isAdmin) return true;
    if (!this.permissions) return false;
    return this.permissions[tab as keyof RolePermissions] ?? false;
  }

  getFirstAllowedTab(): Tab | null {
    const tabs: Tab[] = ['smt', 'bom', 'subassembly', 'hilight', 'hl', 'history', 'users', 'families'];
    return tabs.find(t => this.canView(t)) || null;
  }

  setTab(tab: Tab) {
    if (!this.canView(tab)) return;
    this.activeTab = tab;
    this.sidebarOpen = false;
    this.cdr.detectChanges();
  }

  toggleSidebar() {
    this.sidebarOpen = !this.sidebarOpen;
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent) {
    const target = event.target as HTMLElement;
    if (!target.closest('.sidebar') && !target.closest('.btn-sidebar-toggle')) {
      this.sidebarOpen = false;
    }
  }

  logout() {
    this.authService.logout();
  }
}