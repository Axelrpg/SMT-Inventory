import { Component, inject, OnInit, ChangeDetectorRef } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators, FormsModule } from '@angular/forms';
import { AsyncPipe, DatePipe } from '@angular/common';
import { ZXingScannerModule } from '@zxing/ngx-scanner';
import { BarcodeFormat } from '@zxing/library';
import { SmtService } from '../../../../core/services/smt.service';
import { SmtRoll, SmtMovement } from '../../../../core/models/smt.model';
import { Observable } from 'rxjs';
import { AuthService } from '../../../../core/services/auth.service';
import { collection, QueryDocumentSnapshot } from '@angular/fire/firestore';
import { ExportService } from '../../../../core/services/export.service';

type View = 'list' | 'input' | 'output' | 'history';
type InputMode = 'manual' | 'camera';

@Component({
  selector: 'app-smt-component',
  standalone: true,
  imports: [ReactiveFormsModule, FormsModule, ZXingScannerModule, AsyncPipe, DatePipe],
  templateUrl: './smt-component.html',
  styleUrl: './smt-component.css'
})
export class SmtComponent implements OnInit {
  private smtService = inject(SmtService);
  private authService = inject(AuthService)
  private exportService = inject(ExportService);
  private fb = inject(FormBuilder);
  private cdr = inject(ChangeDetectorRef);

  isAdmin = false;

  rolls: SmtRoll[] = [];
  lastDoc: QueryDocumentSnapshot | null = null;
  hasMore = true;
  loadingMore = false;
  readonly PAGE_SIZE = 10;

  searchPartNumber = '';
  isSearching = false;
  searchScannerEnabled = false;
  searchFormats = [
    BarcodeFormat.QR_CODE,
    BarcodeFormat.CODE_128,
    BarcodeFormat.EAN_13,
    BarcodeFormat.CODE_39
  ];

  movements$?: Observable<SmtMovement[]>;
  selectedRoll: SmtRoll | null = null;
  outputStep: 'form' | 'ubicaciones' | 'confirmar' = 'form';
  foundRolls: SmtRoll[] = [];

  view: View = 'list';
  inputMode: InputMode = 'manual';
  scannerEnabled = false;
  scanTarget: 'partNumber' | 'location' = 'partNumber';

  loading = false;
  error = '';
  success = '';

  showEditModal = false;
  editingRoll: SmtRoll | null = null;

  formats = [
    BarcodeFormat.QR_CODE,
    BarcodeFormat.CODE_128,
    BarcodeFormat.EAN_13,
    BarcodeFormat.CODE_39
  ];

  // Formulario entrada
  inputForm = this.fb.group({
    partNumber: ['', [Validators.required, Validators.minLength(18), Validators.maxLength(18)]],
    quantity: [null, [Validators.required, Validators.min(1)]],
    location: ['', Validators.required],
  });

  // Formulario salida
  outputForm = this.fb.group({
    partNumber: ['', [Validators.required, Validators.minLength(18), Validators.maxLength(18)]],
    quantity: [null, [Validators.required, Validators.min(1)]],
    location: ['', Validators.required],
  });

  // Formulario edición
  editForm = this.fb.group({
    partNumber: ['', Validators.required, Validators.minLength(18), Validators.maxLength(18)],
    quantity: [0, [Validators.required, Validators.min(0)]],
    location: ['', Validators.required],
  });

  async ngOnInit() {
    this.authService.currentUserWithRole$.subscribe(snap => {
      const data = (snap as any)?.data();
      this.isAdmin = data?.role === 'admin';
      this.cdr.detectChanges();
    });

    await this.loadFirstPage();
  }

  // ── Carga inicial ────────────────────────────────────
  async loadFirstPage() {
    this.loading = true;
    try {
      const result = await this.smtService.getRollsPaginated(this.PAGE_SIZE);
      this.rolls = result.rolls;
      this.lastDoc = result.lastDoc;
      this.hasMore = result.rolls.length === this.PAGE_SIZE;
    } catch (e: any) {
      this.error = e.message;
    } finally {
      this.loading = false;
      this.cdr.detectChanges();
    }
  }

  // ── Cargar más ───────────────────────────────────────
  async loadMore() {
    if (!this.lastDoc || this.loadingMore) return;
    this.loadingMore = true;
    try {
      const result = await this.smtService.getRollsNextPage(this.PAGE_SIZE, this.lastDoc);
      this.rolls = [...this.rolls, ...result.rolls];
      this.lastDoc = result.lastDoc;
      this.hasMore = result.rolls.length === this.PAGE_SIZE;
    } catch (e: any) {
      this.error = e.message;
    } finally {
      this.loadingMore = false;
      this.cdr.detectChanges();
    }
  }

  // ── Búsqueda ─────────────────────────────────────────
  async onSearch() {
    if (this.searchPartNumber.trim().length !== 18) {
      if (!this.searchPartNumber.trim()) {
        this.isSearching = false;
        await this.loadFirstPage();
      }
      return;
    }

    this.isSearching = true;
    this.loading = true;
    try {
      this.rolls = await this.smtService.searchRollsByPartNumber(this.searchPartNumber.trim());
      this.hasMore = false;
    } catch (e: any) {
      this.error = e.message;
    } finally {
      this.loading = false;
      this.cdr.detectChanges();
    }
  }

  async clearSearch() {
    this.searchPartNumber = '';
    this.isSearching = false;
    this.searchScannerEnabled = false;
    await this.loadFirstPage();
  }

  // ── Escáner de búsqueda ──────────────────────────────
  toggleSearchScanner() {
    this.searchScannerEnabled = !this.searchScannerEnabled;
  }

  async onSearchCodeScanned(code: string) {
    if (!code) return;
    this.searchScannerEnabled = false;
    this.searchPartNumber = code.substring(0, 18); // recorta si el código es más largo
    await this.onSearch();
  }

  // ── Actualizar goBack para recargar lista ─────────────
  goBack() {
    this.view = 'list';
    this.scannerEnabled = false;
    this.inputMode = 'manual';
    this.outputStep = 'form';
    this.foundRolls = [];
    this.selectedRoll = null;
    this.error = '';
    this.inputForm.reset({ quantity: null });
    this.outputForm.reset({ quantity: null });

    if (!this.isSearching) {
      this.loadFirstPage(); // ← solo una vez aquí
    }
  }

  openInput() {
    this.view = 'input';
    this.inputMode = 'manual';
    this.error = '';
    this.inputForm.reset({ quantity: null });
  }

  openOutput() {
    this.view = 'output';
    this.outputStep = 'form';
    this.foundRolls = [];
    this.selectedRoll = null;
    this.inputMode = 'manual';
    this.error = '';
    this.outputForm.reset({ quantity: null });
  }

  // ── Escáner ──────────────────────────────────────────
  setInputMode(mode: InputMode) {
    this.inputMode = mode;
    this.scannerEnabled = mode === 'camera';
  }

  openCameraFor(target: 'partNumber' | 'location') {
    // Si ya está escaneando el mismo campo, apaga la cámara
    if (this.scannerEnabled && this.scanTarget === target) {
      this.scannerEnabled = false;
      return;
    }

    // Si está escaneando otro campo o estaba apagada, enciende para este campo
    this.scanTarget = target;
    this.scannerEnabled = true;
  }

  onCodeScanned(code: string) {
    if (!code) return;
    this.scannerEnabled = false;
    this.inputMode = 'manual';

    const trimmed = code.substring(0, 18); // ← recorta si el escáner devuelve más

    if (this.view === 'input') {
      if (this.scanTarget === 'partNumber') {
        this.inputForm.patchValue({ partNumber: trimmed });
      }
    }

    if (this.view === 'output') {
      if (this.scanTarget === 'partNumber') {
        this.outputForm.patchValue({ partNumber: trimmed });
      } else if (this.scanTarget === 'location') {
        this.outputForm.patchValue({ location: trimmed });
      }
    }

    this.cdr.detectChanges();
  }

  // ── Entrada ──────────────────────────────────────────
  async saveInput() {
    if (this.inputForm.invalid) return;
    this.loading = true;
    this.error = '';

    try {
      const { partNumber, quantity, location } = this.inputForm.value;

      let rolls = await this.smtService.getRollsByPartNumber(partNumber!);

      const existingRoll = rolls.find(r =>
        r.location.toLowerCase().trim() === location!.toLowerCase().trim()
      );

      if (existingRoll) {
        await this.smtService.registerMovement(
          existingRoll.id!,
          partNumber!,
          'entrada',
          quantity!
        );
      } else {
        const newId = await this.smtService.addRoll({
          partNumber: partNumber!,
          quantity: 0,        // ← siempre 0, registerMovement sumará
          location: location!
        });

        await this.smtService.registerMovement(
          newId,
          partNumber!,
          'entrada',
          quantity!
        );
      }

      this.success = `Entrada registrada — ${partNumber} (+${quantity} pzs)`;
      this.goBack();
      setTimeout(() => this.success = '', 4000);
    } catch (e: any) {
      this.error = e.message || 'Error al registrar entrada';
    } finally {
      this.loading = false;
      this.cdr.detectChanges();
    }
  }

  // ── Salida ───────────────────────────────────────────
  async searchRolls() {
    const { partNumber } = this.outputForm.value;
    if (!partNumber) return;

    this.loading = true;
    this.error = '';

    try {
      const rolls = await this.smtService.getRollsByPartNumber(partNumber);

      if (rolls.length === 0) {
        this.error = 'No se encontraron rollos con ese número de parte';
        return;
      }

      this.foundRolls = rolls.filter(r => r.quantity > 0);

      if (this.foundRolls.length === 0) {
        this.error = 'No hay rollos disponibles con ese número de parte';
        return;
      }


      if (this.foundRolls.length === 1) {
        this.selectRoll(this.foundRolls[0]);
      } else {
        this.outputStep = 'ubicaciones';
      }

    } catch (error) {
      this.error = (error as any).message || 'Error al buscar rollos';
    } finally {
      this.loading = false;
      this.cdr.detectChanges();
    }
  }

  selectRoll(roll: SmtRoll) {
    this.selectedRoll = roll;
    this.outputForm.patchValue({ location: roll.location, quantity: null });
    this.outputStep = 'confirmar';
    this.cdr.detectChanges();
  }

  async saveOutput() {
    if (!this.selectedRoll?.id) return;
    this.loading = true;
    this.error = '';

    try {
      const { quantity } = this.outputForm.value;

      if (quantity! > this.selectedRoll.quantity) {
        this.error = 'Cantidad excede el stock disponible';
        return;
      }

      await this.smtService.registerMovement(
        this.selectedRoll.id,
        this.selectedRoll.partNumber,
        'salida',
        quantity!
      );

      this.success = `Salida registrada — ${this.selectedRoll.partNumber} (-${quantity} pzs)`;
      this.goBack();
      setTimeout(() => this.success = '', 4000);
    } catch (error) {
      this.error = (error as any).message || 'Error al registrar salida';
    } finally {
      this.loading = false;
      this.cdr.detectChanges();
    }
  }

  // ── Historial ────────────────────────────────────────
  openHistory(roll: SmtRoll) {
    this.selectedRoll = roll;
    this.movements$ = this.smtService.getMovements(roll.id!);
    this.view = 'history';
  }

  // ── Editar rollo ─────────────────────────────────────
  openEditModal(roll: SmtRoll) {
    this.editingRoll = roll;
    this.editForm.patchValue(roll);
    this.showEditModal = true;
  }

  async saveEdit() {
    if (this.editForm.invalid || !this.editingRoll?.id) return;
    this.loading = true;
    this.error = '';

    try {
      const { partNumber, quantity, location } = this.editForm.value;
      await this.smtService.updateRoll(this.editingRoll.id, {
        partNumber: partNumber!,
        quantity: quantity!,
        location: location!
      });
      this.success = 'Rollo actualizado';
      this.showEditModal = false;
      setTimeout(() => this.success = '', 3000);
    } catch (e: any) {
      this.error = e.message || 'Error al actualizar';
    } finally {
      this.loading = false;
      await this.loadFirstPage();
      this.cdr.detectChanges();
    }
  }

  // ── Eliminar rollo ───────────────────────────────────
  async deleteRoll(roll: SmtRoll) {
    if (!confirm(`¿Eliminar rollo ${roll.partNumber}?`)) return;
    try {
      await this.smtService.deleteRoll(roll.id!);
      this.success = 'Rollo eliminado';
      setTimeout(() => this.success = '', 3000);
    } catch (e: any) {
      this.error = e.message;
    } finally {
      await this.loadFirstPage();
      this.cdr.detectChanges();
    }
  }

  // ── Exportar a Excel ─────────────────────────────────
  async exportRolls() {
    // Cargar todos los rollos sin paginado
    const ref = collection(this.smtService['firestore'], 'smt_rolls');
    // Mejor agregar un método en el servicio
    const allRolls = await this.smtService.getAllRolls();

    const data = allRolls.map(r => ({
      'Número de Parte': r.partNumber,
      'Cantidad': r.quantity,
      'Ubicación': r.location,
    }));

    this.exportService.exportToExcel(data, 'SMT_Rollos', 'Rollos');
  }

  async exportMovements() {
    const allMovements = await this.smtService.getAllMovementsOnce();

    const data = allMovements.map(m => ({
      'Número de Parte': m.partNumber,
      'Tipo': m.type === 'entrada' ? 'Entrada' : 'Salida',
      'Cantidad': m.quantity,
      'Usuario': m.userEmail,
      'Fecha': m.date?.toDate ? m.date.toDate().toLocaleString('es-MX') : '—',
    }));

    this.exportService.exportToExcel(data, 'SMT_Movimientos', 'Movimientos');
  }
}