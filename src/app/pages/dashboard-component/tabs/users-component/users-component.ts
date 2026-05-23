import { ChangeDetectorRef, Component, inject, OnInit } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { UserService } from '../../../../core/services/user.service';
import { AppUser } from '../../../../core/models/user.model';
import { RoleService } from '../../../../core/services/role.service';
import { Role } from '../../../../core/models/role.model';

@Component({
  selector: 'app-users-component',
  imports: [ReactiveFormsModule],
  templateUrl: './users-component.html',
})
export class UsersComponent implements OnInit {
  private userService = inject(UserService);
  private roleService = inject(RoleService)
  private fb = inject(FormBuilder);
  private cdr = inject(ChangeDetectorRef);

  users: AppUser[] = [];
  availableRoles: Role[] = [];
  loading = false;
  error = ''
  success = ''
  showModal = false
  editingUser: AppUser | null = null

  userForm = this.fb.group({
    displayName: ['', Validators.required],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.minLength(6)]],
    role: ['user', Validators.required],
    roleId: ['']
  });

  async ngOnInit() {
    this.userService.getUsers().subscribe({
      next: (users) => {
        this.users = users;
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.error = err.message || 'Error al cargar los usuarios';
        this.cdr.detectChanges();
      }
    })
    this.availableRoles = await this.roleService.getAll()
  }

  openCreateModel() {
    this.editingUser = null
    this.userForm.reset({ role: 'user' });
    this.userForm.get('password')?.setValidators([Validators.required, Validators.minLength(6)]);
    this.userForm.get('password')?.updateValueAndValidity();
    this.showModal = true
  }

  openEditModel(user: AppUser) {
    this.editingUser = user
    this.userForm.patchValue({
      displayName: user.displayName,
      email: user.email,
      role: user.role,
      password: '',
    });
    this.userForm.get('password')?.clearValidators();
    this.userForm.get('password')?.updateValueAndValidity();
    this.showModal = true
  }

  closeModal() {
    this.showModal = false
    this.error = ''
  }

  async saveUser() {
    if (this.userForm.invalid) return;
    this.loading = true;
    this.error = ''

    try {
      const { displayName, email, password, role, roleId } = this.userForm.value;
      if (this.editingUser) {
        await this.userService.updateUser(this.editingUser.uid, {
          email: email!,
          displayName: displayName!,
          role: role!,
          roleId: roleId || ''
        });
        this.success = 'Usuario actualizado correctamente';
      } else {
        await this.userService.createUser({
          displayName: displayName!,
          email: email!,
          password: password!,
          role: role!,
          roleId: roleId || ''
        });
        this.success = 'Usuario creado correctamente';
      }
      this.showModal = false
      setTimeout(() => {
        this.success = ''
      }, 3000);
    }
    catch (err: any) {
      this.error = err.message || 'Error al guardar el usuario';
    } finally {
      this.loading = false;
      this.cdr.detectChanges();
    }
  }

  async deleteUser(user: AppUser) {
    if (!confirm(`¿Estás seguro de eliminar al usuario ${user.displayName}?`)) return;
    try {
      await this.userService.deleteUser(user.uid);
      this.success = 'Usuario eliminado correctamente';
      setTimeout(() => {
        this.success = ''
      }, 3000);
    }
    catch (err: any) {
      this.error = err.message || 'Error al eliminar el usuario';
    } finally {
      this.cdr.detectChanges();
    }
  }
}
