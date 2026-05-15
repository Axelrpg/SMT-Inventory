import { ChangeDetectorRef, Component, inject, OnInit } from '@angular/core';
import { AuthService } from '../../core/services/auth.service';
import { UsersComponent } from './tabs/users-component/users-component';
import { SmtComponent } from './tabs/smt-component/smt-component';
import { BomComponent } from './tabs/bom-component/bom-component';

type Tab = 'SMT' | 'BOM' | 'users';

@Component({
  selector: 'app-dashboard-component',
  imports: [SmtComponent, UsersComponent, BomComponent],
  templateUrl: './dashboard-component.html',
})
export class DashboardComponent implements OnInit {
  private authService = inject(AuthService);
  private cdr = inject(ChangeDetectorRef);

  isAdmin = false;
  activeTab: Tab = 'SMT';

  async ngOnInit() {
    this.authService.currentUserWithRole$.subscribe(snap => {
      const data = (snap as any)?.data();
      this.isAdmin = data?.role === 'admin';
      this.cdr.detectChanges();
    })
  }

  setTab(tab: Tab) {
    this.activeTab = tab;
  }

  logout() {
    this.authService.logout();
  }
}
