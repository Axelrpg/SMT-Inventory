import { Component, inject, OnInit, ChangeDetectorRef } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { FormsModule } from '@angular/forms';
import { AsyncPipe, DatePipe } from '@angular/common';
import { ZXingScannerModule } from '@zxing/ngx-scanner';
import { BarcodeFormat } from '@zxing/library';
import { HilightService } from '../../../../core/services/hilight.service';
import { AuthService } from '../../../../core/services/auth.service';
import { ExportService } from '../../../../core/services/export.service';
import { HilightRoll, HilightMovement } from '../../../../core/models/hilight.model';
import { QueryDocumentSnapshot } from '@angular/fire/firestore';
import { Observable } from 'rxjs';

type View = 'list' | 'input' | 'output' | 'history';
type OutputStep = 'form' | 'locations' | 'confirm';

@Component({
  selector: 'app-hilight-component',
  standalone: true,
  imports: [ReactiveFormsModule, FormsModule, ZXingScannerModule, AsyncPipe, DatePipe],
  templateUrl: './hilight-component.html',
  styleUrl: './hilight-component.css'
})
export class HilightComponent implements OnInit {
  private service = inject(HilightService);
  private authService = inject(AuthService);
  private exportService = inject(ExportService);
  private fb = inject(FormBuilder);
  private cdr = inject(ChangeDetectorRef);

  // ── Lista ─────────────────────────────────────────────
  allLoadedRolls: HilightRoll[] = [];
  filteredRolls: HilightRoll[] = [];
  lastDoc: QueryDocumentSnapshot | null = null;
  hasMore = true;
  loading = false;
  loadingMore = false;
  pageSize = 10;
  pageSizeOptions = [5, 10, 20, 50, 0];

  // ── Búsqueda ──────────────────────────────────────────
  searchPartNumber = '';
  isSearching = false;
  searchScannerEnabled = false;

  // ── Estado general ────────────────────────────────────
  view: View = 'list';
  error = '';
  success = '';
  isAdmin = false;
  movements$?: Observable<HilightMovement[]>;
  selectedRoll: HilightRoll | null = null;

  // ── Escáner ───────────────────────────────────────────
  scannerEnabled = false;
  scanTarget: 'partNumber' | 'location' = 'partNumber';
  searchFormats = [
    BarcodeFormat.QR_CODE,
    BarcodeFormat.CODE_128,
    BarcodeFormat.EAN_13,
    BarcodeFormat.CODE_39
  ];

  // ── Salida ────────────────────────────────────────────
  outputStep: OutputStep = 'form';
  foundRolls: HilightRoll[] = [];

  // ── Modal edición ─────────────────────────────────────
  showEditModal = false;
  editingRoll: HilightRoll | null = null;

  // ── Formularios ───────────────────────────────────────
  inputForm = this.fb.group({
    partNumber: ['', [Validators.required, Validators.minLength(18), Validators.maxLength(18)]],
    length: [null as number | null, [Validators.required, Validators.min(0.01)]],
    location: ['', Validators.required],
  });

  outputForm = this.fb.group({
    partNumber: ['', [Validators.required, Validators.minLength(18), Validators.maxLength(18)]],
    length: [null as number | null, [Validators.required, Validators.min(0.01)]],
  });

  editForm = this.fb.group({
    partNumber: ['', [Validators.required, Validators.minLength(18), Validators.maxLength(18)]],
    length: [0, [Validators.required, Validators.min(0)]],
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

  // ── Paginado ──────────────────────────────────────────
  async loadFirstPage() {
    this.loading = true;
    try {
      if (this.pageSize === 0) {
        const all = await this.service.getAllRolls();
        this.allLoadedRolls = all;
        this.filteredRolls = all;
        this.lastDoc = null;
        this.hasMore = false;
      } else {
        const result = await this.service.getRollsPaginated(this.pageSize);
        this.allLoadedRolls = result.rolls;
        this.filteredRolls = result.rolls;
        this.lastDoc = result.lastDoc;
        this.hasMore = result.rolls.length === this.pageSize;
      }
    } catch (e: any) {
      this.error = e.message;
    } finally {
      this.loading = false;
      this.cdr.detectChanges();
    }
  }

  async loadMore() {
    if (!this.lastDoc || this.loadingMore || this.pageSize === 0) return;
    this.loadingMore = true;
    try {
      const result = await this.service.getRollsPaginated(this.pageSize, this.lastDoc);
      this.allLoadedRolls = [...this.allLoadedRolls, ...result.rolls];
      this.filteredRolls = this.applyFilter(this.allLoadedRolls);
      this.lastDoc = result.lastDoc;
      this.hasMore = result.rolls.length === this.pageSize;
    } catch (e: any) {
      this.error = e.message;
    } finally {
      this.loadingMore = false;
      this.cdr.detectChanges();
    }
  }

  async onPageSizeChange(size: number) {
    this.pageSize = size;
    this.searchPartNumber = '';
    this.isSearching = false;
    await this.loadFirstPage();
  }

  // ── Búsqueda ──────────────────────────────────────────
  applyFilter(rolls: HilightRoll[]): HilightRoll[] {
    if (!this.searchPartNumber.trim()) return rolls;

    const search = this.searchPartNumber.trim().toLocaleLowerCase()
    return rolls.filter(r => {
      const matchPartNumber = r.partNumber.toLocaleLowerCase().includes(search)
      const matchLocation = r.location ? r.location.toLocaleLowerCase().includes(search) : false
      return matchPartNumber || matchLocation;
    })
  }

  onSearch() {
    this.isSearching = !!this.searchPartNumber.trim();
    this.filteredRolls = this.applyFilter(this.allLoadedRolls);
    this.cdr.detectChanges();
  }

  clearSearch() {
    this.searchPartNumber = '';
    this.isSearching = false;
    this.searchScannerEnabled = false;
    this.filteredRolls = this.allLoadedRolls;
    this.cdr.detectChanges();
  }

  toggleSearchScanner() {
    this.searchScannerEnabled = !this.searchScannerEnabled;
  }

  onSearchCodeScanned(code: string) {
    if (!code) return;
    this.searchScannerEnabled = false;
    this.searchPartNumber = code.substring(0, 18);
    this.onSearch();
  }

  // ── Navegación ────────────────────────────────────────
  goBack() {
    this.view = 'list';
    this.scannerEnabled = false;
    this.outputStep = 'form';
    this.foundRolls = [];
    this.selectedRoll = null;
    this.error = '';
    this.inputForm.reset({ length: null });
    this.outputForm.reset({ length: null });
    if (!this.isSearching) this.loadFirstPage();
    else this.filteredRolls = this.applyFilter(this.allLoadedRolls);
  }

  openInput() {
    this.view = 'input';
    this.error = '';
    this.scannerEnabled = false;
    this.inputForm.reset({ length: null });
  }

  openOutput() {
    this.view = 'output';
    this.outputStep = 'form';
    this.foundRolls = [];
    this.selectedRoll = null;
    this.error = '';
    this.scannerEnabled = false;
    this.outputForm.reset({ length: null });
  }

  openHistory(roll: HilightRoll) {
    this.selectedRoll = roll;
    this.movements$ = this.service.getMovements(roll.id!);
    this.view = 'history';
  }

  openEditModal(roll: HilightRoll) {
    this.editingRoll = roll;
    this.editForm.patchValue({
      partNumber: roll.partNumber,
      length: roll.length,
      location: roll.location
    });
    this.showEditModal = true;
  }

  // ── Escáner ───────────────────────────────────────────
  openCameraFor(target: 'partNumber' | 'location') {
    if (this.scannerEnabled && this.scanTarget === target) {
      this.scannerEnabled = false;
      return;
    }
    this.scanTarget = target;
    this.scannerEnabled = true;
  }

  onCodeScanned(code: string) {
    if (!code) return;
    this.scannerEnabled = false;
    const trimmed = code.substring(0, 18);

    if (this.view === 'input') {
      if (this.scanTarget === 'partNumber') this.inputForm.patchValue({ partNumber: trimmed });
      else this.inputForm.patchValue({ location: trimmed });
    }
    if (this.view === 'output') {
      if (this.scanTarget === 'partNumber') this.outputForm.patchValue({ partNumber: trimmed });
    }
    this.cdr.detectChanges();
  }

  // ── Entrada ───────────────────────────────────────────
  async saveInput() {
    if (this.inputForm.invalid) return;
    this.loading = true;
    this.error = '';

    try {
      const { partNumber, length, location } = this.inputForm.value;
      const rolls = await this.service.getRollsByPartNumber(partNumber!);
      const existing = rolls.find(r =>
        r.location.toLowerCase().trim() === location!.toLowerCase().trim()
      );

      if (existing) {
        await this.service.registerMovement(existing.id!, existing.partNumber, 'input', length!);
      } else {
        const newId = await this.service.addRoll({
          partNumber: partNumber!,
          length: 0,
          location: location!
        });
        await this.service.registerMovement(newId, partNumber!, 'input', length!);
      }

      this.success = `Entrada registrada — ${partNumber} (+${length}m)`;
      this.goBack();
      setTimeout(() => this.success = '', 4000);
    } catch (e: any) {
      this.error = e.message || 'Error al registrar entrada';
    } finally {
      this.loading = false;
      this.cdr.detectChanges();
    }
  }

  // ── Salida ────────────────────────────────────────────
  async searchRolls() {
    const { partNumber } = this.outputForm.value;
    if (!partNumber?.trim()) return;
    this.loading = true;
    this.error = '';

    try {
      const rolls = await this.service.getRollsByPartNumber(partNumber);
      const available = rolls.filter(r => r.length > 0);

      if (rolls.length === 0) {
        this.error = `No existe ningún rollo con número de parte: ${partNumber}`;
        return;
      }
      if (available.length === 0) {
        this.error = `Sin longitud disponible para: ${partNumber}`;
        return;
      }

      this.foundRolls = available;
      if (available.length === 1) {
        this.selectedRoll = available[0];
        this.outputForm.patchValue({ length: null });
        this.outputStep = 'confirm';
      } else {
        this.outputStep = 'locations';
      }
    } catch (e: any) {
      this.error = e.message || 'Error al buscar rollo';
    } finally {
      this.loading = false;
      this.cdr.detectChanges();
    }
  }

  selectRoll(roll: HilightRoll) {
    this.selectedRoll = roll;
    this.outputForm.patchValue({ length: null });
    this.outputStep = 'confirm';
    this.cdr.detectChanges();
  }

  async saveOutput() {
    if (!this.selectedRoll?.id || this.outputForm.invalid) return;
    this.loading = true;
    this.error = '';

    try {
      const { length } = this.outputForm.value;

      if (length! > this.selectedRoll.length) {
        this.error = `Longitud insuficiente. Disponible: ${this.selectedRoll.length}m`;
        return;
      }

      await this.service.registerMovement(
        this.selectedRoll.id!, this.selectedRoll.partNumber, 'output', length!
      );

      this.success = `Salida registrada — ${this.selectedRoll.partNumber} (-${length}m)`;
      this.goBack();
      setTimeout(() => this.success = '', 4000);
    } catch (e: any) {
      this.error = e.message || 'Error al registrar salida';
    } finally {
      this.loading = false;
      this.cdr.detectChanges();
    }
  }

  // ── CRUD ──────────────────────────────────────────────
  async saveEdit() {
    if (this.editForm.invalid || !this.editingRoll?.id) return;
    this.loading = true;
    this.error = '';
    try {
      const { partNumber, length, location } = this.editForm.value;
      await this.service.updateRoll(this.editingRoll.id, {
        partNumber: partNumber!,
        length: length!,
        location: location!
      });
      this.success = 'Rollo actualizado';
      this.showEditModal = false;
      await this.loadFirstPage();
      setTimeout(() => this.success = '', 3000);
    } catch (e: any) {
      this.error = e.message || 'Error al actualizar';
    } finally {
      this.loading = false;
      this.cdr.detectChanges();
    }
  }

  async deleteRoll(roll: HilightRoll) {
    if (!confirm(`¿Eliminar rollo ${roll.partNumber}?`)) return;
    try {
      await this.service.deleteRoll(roll.id!);
      this.success = 'Rollo eliminado';
      await this.loadFirstPage();
      setTimeout(() => this.success = '', 3000);
    } catch (e: any) {
      this.error = e.message;
    } finally {
      this.cdr.detectChanges();
    }
  }

  // ── Exportar ──────────────────────────────────────────
  async exportRolls() {
    const all = await this.service.getAllRolls();
    const data = all.map(r => ({
      'Número de Parte': r.partNumber,
      'Longitud (m)': r.length,
      'Ubicación': r.location,
    }));
    this.exportService.exportToExcel(data, 'Hilight_Rollos', 'Rollos');
  }

  async exportMovements() {
    const all = await this.service.getAllMovementsOnce();
    const data = all.map(m => ({
      'Número de Parte': m.partNumber,
      'Tipo': m.type === 'input' ? 'Entrada' : 'Salida',
      'Longitud (m)': m.length,
      'Usuario': m.userName,
      'Fecha': m.date?.toDate ? m.date.toDate().toLocaleString('es-MX') : '—',
    }));
    this.exportService.exportToExcel(data, 'Hilight_Movimientos', 'Movimientos');
  }
}