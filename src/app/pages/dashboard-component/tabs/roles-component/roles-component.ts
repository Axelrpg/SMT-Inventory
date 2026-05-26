import { Component, inject, OnInit, ChangeDetectorRef } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { FormsModule } from '@angular/forms';
import { RoleService } from '../../../../core/services/role.service';
import { Role, RolePermissions } from '../../../../core/models/role.model';

interface PermissionOption {
  key: keyof RolePermissions;
  label: string;
  icon: string;
}

@Component({
  selector: 'app-roles-component',
  standalone: true,
  imports: [ReactiveFormsModule, FormsModule],
  templateUrl: './roles-component.html',
  styleUrl: './roles-component.css'
})
export class RolesComponent implements OnInit {
  private roleService = inject(RoleService);
  private fb = inject(FormBuilder);
  private cdr = inject(ChangeDetectorRef);

  roles: Role[] = [];
  loading = false;
  error = '';
  success = '';
  showModal = false;
  editingRole: Role | null = null;

  permissionOptions: PermissionOption[] = [
    { key: 'smt', label: 'SMT', icon: 'bi-upc-scan' },
    { key: 'bom', label: 'BOM', icon: 'bi-journal-text' },
    { key: 'subassembly', label: 'Subensambles', icon: 'bi-layers' },
    { key: 'hilight', label: 'Hilight', icon: 'bi-lightning' },
    { key: 'hl', label: 'HL', icon: 'bi-box' },
    { key: 'history', label: 'Historial', icon: 'bi-clock-history' },
    { key: 'users', label: 'Usuarios', icon: 'bi-people' },
    { key: 'families', label: 'Familias', icon: 'bi-diagram-3' },
  ];

  permissions: RolePermissions = {
    smt: false, bom: false, subassembly: false, hilight: false, hl: false,
    history: false, users: false, families: false
  };

  roleForm = this.fb.group({
    name: ['', Validators.required]
  });

  async ngOnInit() {
    await this.loadRoles();
  }

  async loadRoles() {
    this.loading = true;
    try {
      this.roles = await this.roleService.getAll();
    } catch (e: any) {
      this.error = e.message;
    } finally {
      this.loading = false;
      this.cdr.detectChanges();
    }
  }

  openCreateModal() {
    this.editingRole = null;
    this.roleForm.reset();
    this.permissions = {
      smt: false, bom: false, subassembly: false, hilight: false, hl: false,
      history: false, users: false, families: false
    };
    this.error = '';
    this.showModal = true;
  }

  openEditModal(role: Role) {
    this.editingRole = role;
    this.roleForm.patchValue({ name: role.name });
    // Spread para evitar referencias al objeto original
    this.permissions = {
      smt: role.permissions.smt ?? false,
      bom: role.permissions.bom ?? false,
      subassembly: role.permissions.subassembly ?? false,
      hilight: role.permissions.hilight ?? false,
      hl: role.permissions.hl ?? false,
      history: role.permissions.history ?? false,
      users: role.permissions.users ?? false,
      families: role.permissions.families ?? false
    };
    this.error = '';
    this.showModal = true;
    this.cdr.detectChanges();
  }

  togglePermission(key: keyof RolePermissions) {
    // Crear nuevo objeto para forzar detección de cambios
    this.permissions = {
      ...this.permissions,
      [key]: !this.permissions[key]
    };
    this.cdr.detectChanges();
  }

  toggleAll(value: boolean) {
    this.permissions = {
      smt: value,
      bom: value,
      subassembly: value,
      hilight: value,
      hl: value,
      history: value,
      users: value,
      families: value
    };
    this.cdr.detectChanges();
  }

  get allSelected(): boolean {
    return this.permissionOptions.every(p => this.permissions[p.key]);
  }

  async save() {
    if (this.roleForm.invalid) return;
    this.loading = true;
    this.error = '';

    try {
      const { name } = this.roleForm.value;
      const data = { name: name!, permissions: this.permissions };

      if (this.editingRole?.id) {
        await this.roleService.update(this.editingRole.id, data);
        this.success = 'Rol actualizado correctamente';
      } else {
        await this.roleService.add(data);
        this.success = 'Rol creado correctamente';
      }

      this.showModal = false;
      await this.loadRoles();
      setTimeout(() => this.success = '', 3000);
    } catch (e: any) {
      this.error = e.message || 'Error al guardar el rol';
    } finally {
      this.loading = false;
      this.cdr.detectChanges();
    }
  }

  async deleteRole(role: Role) {
    if (!confirm(`¿Eliminar rol "${role.name}"?`)) return;
    try {
      await this.roleService.delete(role.id!);
      this.success = 'Rol eliminado';
      await this.loadRoles();
      setTimeout(() => this.success = '', 3000);
    } catch (e: any) {
      this.error = e.message;
    } finally {
      this.cdr.detectChanges();
    }
  }

  permissionsCount(role: Role): number {
    return Object.values(role.permissions).filter(Boolean).length;
  }
}