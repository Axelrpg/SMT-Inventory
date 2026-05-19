import { Component, inject, OnInit, ChangeDetectorRef } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { FormsModule } from '@angular/forms';
import { AsyncPipe, DatePipe } from '@angular/common';
import { ZXingScannerModule } from '@zxing/ngx-scanner';
import { BarcodeFormat } from '@zxing/library';
import { SubassemblyService } from '../../../../core/services/subassembly.service';
import { AuthService } from '../../../../core/services/auth.service';
import { ExportService } from '../../../../core/services/export.service';
import { Subassembly, SubassemblyMovement } from '../../../../core/models/subassembly.model';
import { QueryDocumentSnapshot } from '@angular/fire/firestore';
import { Observable } from 'rxjs';
import { FamilyService } from '../../../../core/services/family.service';

type View = 'list' | 'input' | 'output' | 'history';
type OutputStep = 'form' | 'confirm';

@Component({
  selector: 'app-subassembly-component',
  standalone: true,
  imports: [ReactiveFormsModule, FormsModule, ZXingScannerModule, AsyncPipe, DatePipe],
  templateUrl: './subassembly-component.html',
  styleUrl: './subassembly-component.css'
})
export class SubassemblyComponent implements OnInit {
  private subassemblyService = inject(SubassemblyService);
  private authService = inject(AuthService);
  private familyService = inject(FamilyService)
  private exportService = inject(ExportService);
  private fb = inject(FormBuilder);
  private cdr = inject(ChangeDetectorRef);

  // ── Lista ─────────────────────────────────────────────
  allLoadedItems: Subassembly[] = [];
  filteredItems: Subassembly[] = [];
  lastDoc: QueryDocumentSnapshot | null = null;
  hasMore = true;
  loading = false;
  loadingMore = false;
  pageSize = 10;
  pageSizeOptions = [5, 10, 20, 50, 0];
  partNumber = '';
  searchPartNumber = '';

  familyMap = new Map<string, string>(); // partNumber → familyName
  familyForInput: string | null = null;

  // ── Búsqueda ──────────────────────────────────────────
  searchText = '';
  isSearching = false;
  searchScannerEnabled = false;

  // ── Estado general ────────────────────────────────────
  view: View = 'list';
  withdrawMode: 'all' | 'custom' = 'all'; // Por defecto 'Retirar todo'
  error = '';
  success = '';
  isAdmin = false;
  movements$?: Observable<SubassemblyMovement[]>;
  selectedItem: Subassembly | null = null;

  // ── Escáner ───────────────────────────────────────────
  scannerEnabled = false;
  scanTarget: 'magazine' | 'partNumber' = 'magazine';
  formats = [
    BarcodeFormat.QR_CODE,
    BarcodeFormat.CODE_128,
    BarcodeFormat.EAN_13,
    BarcodeFormat.CODE_39
  ];

  // ── Modal edición ─────────────────────────────────────
  showEditModal = false;
  editingItem: Subassembly | null = null;

  // ── Formularios ───────────────────────────────────────
  inputForm = this.fb.group({
    magazine: ['', Validators.required],
    partNumber: ['', [Validators.required, Validators.minLength(8), Validators.maxLength(8)]],
    quantity: [null as number | null, [Validators.required, Validators.min(1)]],
  });

  outputForm = this.fb.group({
    magazine: ['', Validators.required],
    quantity: [null as number | null, [Validators.required, Validators.min(1)]],
  });

  editForm = this.fb.group({
    magazine: ['', Validators.required],
    partNumber: ['', [Validators.required, Validators.minLength(8), Validators.maxLength(8)]],
    quantity: [0, [Validators.required, Validators.min(0)]],
  });

  outputStep: OutputStep = 'form';
  foundItem: Subassembly | null = null;

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
        const all = await this.subassemblyService.getAll();
        this.allLoadedItems = all;
        this.filteredItems = all;
        this.lastDoc = null;
        this.hasMore = false;
      } else {
        const result = await this.subassemblyService.getPaginated(this.pageSize);
        this.allLoadedItems = result.items;
        this.filteredItems = result.items;
        this.lastDoc = result.lastDoc;
        this.hasMore = result.items.length === this.pageSize;
      }
      await this.loadFamiliesForItems(this.allLoadedItems)
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
      const result = await this.subassemblyService.getPaginated(this.pageSize, this.lastDoc);
      this.allLoadedItems = [...this.allLoadedItems, ...result.items];
      this.filteredItems = this.applyFilter(this.allLoadedItems);
      this.lastDoc = result.lastDoc;
      this.hasMore = result.items.length === this.pageSize;
      await this.loadFamiliesForItems(result.items)
    } catch (e: any) {
      this.error = e.message;
    } finally {
      this.loadingMore = false;
      this.cdr.detectChanges();
    }
  }

  // Al cargar los items, buscar sus familias
  async loadFamiliesForItems(items: Subassembly[]) {
    for (const item of items) {
      if (!this.familyMap.has(item.partNumber)) {
        const family = await this.familyService.getByPartNumber(item.partNumber);
        if (family) this.familyMap.set(item.partNumber, family.name);
      }
    }
    this.cdr.detectChanges();
  }

  async onPageSizeChange(size: number) {
    this.pageSize = size;
    this.searchText = '';
    this.isSearching = false;
    await this.loadFirstPage();
  }

  async onPartNumberChange() {
    const partNumber = this.inputForm.get('partNumber')?.value?.trim();
    if (!partNumber) {
      this.familyForInput = null;
      return;
    }
    const family = await this.familyService.getByPartNumber(partNumber);
    this.familyForInput = family?.name || null;
    this.cdr.detectChanges();
  }

  // ── Búsqueda ──────────────────────────────────────────
  applyFilter(items: Subassembly[]): Subassembly[] {
    if (!this.searchText.trim()) return items;
    const s = this.searchText.trim().toLowerCase();
    return items.filter(i =>
      i.magazine.toLowerCase().includes(s) ||
      i.partNumber.toLowerCase().includes(s)
    );
  }

  onSearch() {
    this.isSearching = !!this.searchText.trim();
    this.filteredItems = this.applyFilter(this.allLoadedItems);
    this.cdr.detectChanges();
  }

  clearSearch() {
    this.searchText = '';
    this.isSearching = false;
    this.searchScannerEnabled = false;
    this.filteredItems = this.allLoadedItems;
    this.cdr.detectChanges();
  }

  toggleSearchScanner() {
    this.searchScannerEnabled = !this.searchScannerEnabled;
  }

  onSearchCodeScanned(code: string) {
    if (!code) return;
    this.searchScannerEnabled = false;
    this.searchText = code;
    this.onSearch();
  }

  // ── Navegación ────────────────────────────────────────
  goBack() {
    this.view = 'list';
    this.scannerEnabled = false;
    this.outputStep = 'form';
    this.foundItem = null;
    this.error = '';
    this.familyForInput = null;
    this.inputForm.reset({ quantity: null });
    this.outputForm.reset({ quantity: null });
    if (!this.isSearching) this.loadFirstPage();
    else this.filteredItems = this.applyFilter(this.allLoadedItems);
  }

  openInput() {
    this.view = 'input';
    this.error = '';
    this.scannerEnabled = false;
    this.familyForInput = null;
    this.inputForm.reset({ quantity: null });
  }

  openOutput() {
    this.view = 'output';
    this.outputStep = 'form';
    this.foundItem = null;
    this.error = '';
    this.scannerEnabled = false;
    this.outputForm.reset({ quantity: null });
  }

  openHistory(item: Subassembly) {
    this.selectedItem = item;
    this.movements$ = this.subassemblyService.getMovements(item.id!);
    this.view = 'history';
  }

  openEditModal(item: Subassembly) {
    this.editingItem = item;
    this.editForm.patchValue({
      magazine: item.magazine,
      partNumber: item.partNumber,
      quantity: item.quantity
    });
    this.showEditModal = true;
  }

  // ── Escáner ───────────────────────────────────────────
  openCameraFor(target: 'magazine' | 'partNumber') {
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

    if (this.view === 'input') {
      if (this.scanTarget === 'magazine') {
        this.inputForm.patchValue({ magazine: code });
      } else {
        this.inputForm.patchValue({ partNumber: code });
        this.onPartNumberChange(); // ← agrega esto
      }
    }

    if (this.view === 'output') {
      this.outputForm.patchValue({ magazine: code });
    }

    this.cdr.detectChanges();
  }

  // ── Entrada ───────────────────────────────────────────
  async saveInput() {
    if (this.inputForm.invalid) return;
    this.loading = true;
    this.error = '';

    try {
      const { magazine, partNumber, quantity } = this.inputForm.value;

      const existing = await this.subassemblyService.getByMagazine(magazine!);

      if (existing) {
        const partNumberChanged = existing.partNumber !== partNumber!.trim();

        if (partNumberChanged) {
          // Número de parte diferente — actualizar el número de parte
          // y registrar entrada con cantidad desde 0
          await this.subassemblyService.update(existing.id!, {
            partNumber: partNumber!,
            quantity: 0  // resetear para que registerMovement sume correctamente
          });

          await this.subassemblyService.registerMovement(
            existing.id!, existing.magazine, partNumber!, 'entrada', quantity!
          );
        } else {
          // Mismo número de parte — solo sumar cantidad
          await this.subassemblyService.registerMovement(
            existing.id!, existing.magazine, existing.partNumber, 'entrada', quantity!
          );
        }
      } else {
        // Magazine nuevo — crear y registrar
        const newId = await this.subassemblyService.add({
          magazine: magazine!,
          partNumber: partNumber!,
          quantity: 0
        });
        await this.subassemblyService.registerMovement(
          newId, magazine!, partNumber!, 'entrada', quantity!
        );
      }

      this.success = `Entrada registrada — Magazine ${magazine} (+${quantity} pzs)`;
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
  async searchByMagazine() {
    const { magazine } = this.outputForm.value;
    if (!magazine?.trim()) return;
    this.loading = true;
    this.error = '';

    try {
      const item = await this.subassemblyService.getByMagazine(magazine.trim());
      if (!item) {
        this.error = `No se encontró ningún subensamble con Magazine: ${magazine}`;
        return;
      }
      if (item.quantity === 0) {
        this.error = `Sin stock disponible para Magazine: ${magazine}`;
        return;
      }
      this.foundItem = item;
      this.withdrawMode = 'all'; // Por defecto, al encontrar el item, se selecciona "Retirar todo"
      this.outputForm.patchValue({ quantity: item.quantity });
      this.outputStep = 'confirm';
    } catch (e: any) {
      this.error = e.message || 'Error al buscar magazine';
    } finally {
      this.loading = false;
      this.cdr.detectChanges();
    }
  }

  async saveOutput() {
    if (!this.foundItem?.id) return;

    // Si es modo 'custom', validamos el formulario de forma normal
    if (this.withdrawMode === 'custom' && this.outputForm.invalid) return;
    this.loading = true;
    this.error = '';

    try {
      // Determinamos el valor según el modo seleccionado
      const quantity = this.withdrawMode === 'all'
        ? this.foundItem.quantity
        : Number(this.outputForm.value.quantity);

      if (!quantity || quantity <= 0) {
        this.error = 'La cantidad debe ser mayor a 0';
        return;
      }

      if (quantity > this.foundItem.quantity) {
        this.error = `Stock insuficiente. Disponible: ${this.foundItem.quantity} pzs`;
        return;
      }

      await this.subassemblyService.registerMovement(
        this.foundItem.id!, this.foundItem.magazine,
        this.foundItem.partNumber, 'salida', quantity
      );

      this.success = `Salida registrada — Magazine ${this.foundItem.magazine} (-${quantity} pzs)`;
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
    if (this.editForm.invalid || !this.editingItem?.id) return;
    this.loading = true;
    this.error = '';
    try {
      const { magazine, partNumber, quantity } = this.editForm.value;
      await this.subassemblyService.update(this.editingItem.id, {
        magazine: magazine!,
        partNumber: partNumber!,
        quantity: quantity!
      });
      this.success = 'Subensamble actualizado';
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

  async deleteItem(item: Subassembly) {
    if (!confirm(`¿Eliminar Magazine ${item.magazine}?`)) return;
    try {
      await this.subassemblyService.delete(item.id!);
      this.success = 'Subensamble eliminado';
      await this.loadFirstPage();
      setTimeout(() => this.success = '', 3000);
    } catch (e: any) {
      this.error = e.message;
    } finally {
      this.cdr.detectChanges();
    }
  }

  // Función para cambiar de modo y resetear/asignar valores
  setWithdrawMode(mode: 'all' | 'custom') {
    this.withdrawMode = mode;
    if (mode === 'all') {
      this.outputForm.get('quantity')?.setValue(this.foundItem?.quantity || 0);
    } else {
      this.outputForm.get('quantity')?.setValue(null); // Limpia el input si pasa a personalizado
    }
  }

  // ── Exportar ──────────────────────────────────────────
  async exportSubassemblies() {
    const all = await this.subassemblyService.getAll();
    const data = all.map(i => ({
      'Magazine': i.magazine,
      'Número de Parte': i.partNumber,
      'Cantidad': i.quantity,
    }));
    this.exportService.exportToExcel(data, 'Subensambles', 'Subensambles');
  }

  async exportSubassemblyMovements() {
    const all = await this.subassemblyService.getAllMovementsOnce();
    const data = all.map(m => ({
      'Magazine': m.magazine,
      'Número de Parte': m.partNumber,
      'Tipo': m.type === 'entrada' ? 'Entrada' : 'Salida',
      'Cantidad': m.quantity,
      'Usuario': m.userName,
      'Fecha': m.date?.toDate ? m.date.toDate().toLocaleString('es-MX') : '—',
    }));
    this.exportService.exportToExcel(data, 'Subensambles_Movimientos', 'Movimientos');
  }
}