import { ChangeDetectorRef, Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { AuthService } from '../../core/services/auth.service';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-login-component',
  imports: [ReactiveFormsModule, CommonModule],
  templateUrl: './login-component.html',
})
export class LoginComponent {
  private fb = inject(FormBuilder);
  private authService = inject(AuthService);
  private cdr = inject(ChangeDetectorRef);

  form = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]],
  });

  showPass = false;
  loading = false;
  error = '';

  async onSubmit() {
    if (this.form.invalid) return;

    this.loading = true;
    this.error = '';

    try {
      const { email, password } = this.form.value;
      await this.authService.login(email!, password!);
    } catch (e: any) {
      this.error = e.code === 'auth/invalid-credential'
        ? 'Correo o contraseña incorrectos.'
        : 'Ha ocurrido un error. Inténtalo de nuevo.';
    } finally {
      this.loading = false;
      this.cdr.detectChanges();
    }
  }
}
