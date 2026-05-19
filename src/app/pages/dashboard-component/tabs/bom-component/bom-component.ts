import { Component, inject, OnInit, ChangeDetectorRef } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators, FormsModule } from '@angular/forms';
import { AsyncPipe, DatePipe } from '@angular/common';
import { BomService } from '../../../../core/services/bom.service';
import { SmtService } from '../../../../core/services/smt.service';
import { Bom, BomItem, BomStockItem } from '../../../../core/models/bom.model';
import { SmtRoll } from '../../../../core/models/smt.model';
import { Observable } from 'rxjs';
import { AuthService } from '../../../../core/services/auth.service';
import { QueryDocumentSnapshot } from '@angular/fire/firestore';
import { ExportService } from '../../../../core/services/export.service';

type View = 'list' | 'detail' | 'create' | 'edit' | 'output' | 'history' | 'select-output';

@Component({
  selector: 'app-bom-component',
  standalone: true,
  imports: [ReactiveFormsModule, FormsModule, AsyncPipe, DatePipe],
  templateUrl: './bom-component.html',
  styleUrl: './bom-component.css'
})
export class BomComponent implements OnInit {
  private bomService = inject(BomService);
  private smtService = inject(SmtService);
  private authService = inject(AuthService);
  private exportService = inject(ExportService);
  private fb = inject(FormBuilder);
  private cdr = inject(ChangeDetectorRef);

  isAdmin = false;

  boms: Bom[] = [];
  allRolls: SmtRoll[] = [];
  filteredRolls: SmtRoll[] = [];
  selectedBom: Bom | null = null;
  bomItems: BomItem[] = [];
  stockItems: BomStockItem[] = [];
  movements$?: Observable<any[]>;

  lastBomDoc: QueryDocumentSnapshot | null = null;
  hasMoreBoms = true;
  loadingMoreBoms = false;
  isSearchingBoms = false;
  searchBomName = '';
  readonly BOM_PAGE_SIZE = 10;

  lastPartDoc: QueryDocumentSnapshot | null = null;
  hasMoreParts = true;
  loadingMoreParts = false;
  isSearchingParts = false;
  searchPartExists = true;
  readonly PART_PAGE_SIZE = 5;

  allLoadedBoms: Bom[] = [];
  bomPageSize = 10;
  bomPageSizeOptions = [10, 20, 50, 100, 0];

  view: View = 'list';
  loading = false;
  error = '';
  success = '';
  searchPart = '';
  searchMode: 'name' | 'partNumber' = 'name';

  bulkInput = '';
  showBulkInput = false;

  // Para salida — selección de rollos por ubicación
  outputStep: 'quantity' | 'locations' | 'confirm' = 'quantity';
  outputQuantity = 1;
  currentStockIndex = 0; // índice del item que está seleccionando ubicación
  selectedRolls: { partNumber: string; rollId: string; quantity: number }[] = [];
  pendingItems: BomStockItem[] = []; // items que necesitan selección de ubicación

  // Salida individual
  showSingleOutputModal = false;
  singleOutputItem: BomStockItem | null = null;
  singleOutputForm = this.fb.group({
    quantity: [null, [Validators.required, Validators.min(1)]]
  });
  singleOutputRollId = '';

  bomForm = this.fb.group({
    name: ['', Validators.required],
    description: ['']
  });

  outputForm = this.fb.group({
    quantity: [1, [Validators.required, Validators.min(1)]]
  });

  async ngOnInit() {
    this.authService.currentUserWithRole$.subscribe(snap => {
      const data = (snap as any)?.data();
      this.isAdmin = data?.role === 'admin';
      this.cdr.detectChanges();
    });

    this.bomService.getBoms().subscribe(boms => {
      // Solo para mantener referencia actualizada al editar/eliminar
    });
    await this.loadFirstBoms();
  }

  async loadFirstBoms() {
    this.loading = true;
    try {
      if (this.bomPageSize === 0) {
        const all = await this.bomService.getAllBoms();
        this.allLoadedBoms = all;
        this.boms = all;
        this.lastBomDoc = null;
        this.hasMoreBoms = false;
      } else {
        const result = await this.bomService.getBomsPaginated(this.bomPageSize);
        this.allLoadedBoms = result.boms;
        this.boms = result.boms;
        this.lastBomDoc = result.lastDoc;
        this.hasMoreBoms = result.boms.length === this.bomPageSize;
      }
    } catch (e: any) {
      this.error = e.message;
    } finally {
      this.loading = false;
      this.cdr.detectChanges();
    }
  }

  async loadMoreBoms() {
    if (!this.lastBomDoc || this.loadingMoreBoms) return;
    this.loadingMoreBoms = true;
    try {
      const result = await this.bomService.getBomsPaginated(this.bomPageSize, this.lastBomDoc);
      this.allLoadedBoms = [...this.allLoadedBoms, ...result.boms];
      this.boms = this.applyBomFilter(this.allLoadedBoms);
      this.lastBomDoc = result.lastDoc;
      this.hasMoreBoms = result.boms.length === this.bomPageSize;
    } catch (e: any) {
      this.error = e.message;
    } finally {
      this.loadingMoreBoms = false;
      this.cdr.detectChanges();
    }
  }

  async onBomPageSizeChange(size: number) {
    this.bomPageSize = size;
    this.searchBomName = '';
    this.isSearchingBoms = false;
    await this.loadFirstBoms();
  }

  applyBomFilter(boms: Bom[]): Bom[] {
    if (!this.searchBomName.trim()) return boms;
    const s = this.searchBomName.trim().toLowerCase();
    return boms.filter(b =>
      b.name.toLowerCase().includes(s) ||
      (b.description?.toLowerCase().includes(s) ?? false)
    );
  }

  onSearchBoms() {
    if (this.searchMode === 'partNumber') {
      this.onSearchBomsByPartNumber();
      return;
    }
    this.isSearchingBoms = !!this.searchBomName.trim();
    this.boms = this.applyBomFilter(this.allLoadedBoms);
    this.cdr.detectChanges();
  }

  async onSearchBomsByPartNumber() {
    if (!this.searchBomName.trim()) {
      this.isSearchingBoms = false;
      await this.loadFirstBoms();
      return;
    }
    this.isSearchingBoms = true;
    this.loading = true;
    try {
      this.boms = await this.bomService.getBomsByPartNumber(this.searchBomName.trim());
      this.hasMoreBoms = false;
    } catch (e: any) {
      this.error = e.message;
    } finally {
      this.loading = false;
      this.cdr.detectChanges();
    }
  }

  clearBomSearch() {
    this.searchBomName = '';
    this.isSearchingBoms = false;
    this.boms = this.allLoadedBoms;
    this.cdr.detectChanges();
  }

  // ── Paginado de números de parte ──────────────────────
  async loadFirstParts() {
    this.loadingMoreParts = true;
    try {
      const result = await this.bomService.getPartNumbersPaginated(this.PART_PAGE_SIZE);
      this.filteredRolls = this.filterUniquePartNumbers(result.rolls);
      this.lastPartDoc = result.lastDoc;
      this.hasMoreParts = result.rolls.length === this.PART_PAGE_SIZE;
    } catch (e: any) {
      this.error = e.message;
    } finally {
      this.loadingMoreParts = false;
      this.cdr.detectChanges();
    }
  }

  async loadMoreParts() {
    if (!this.lastPartDoc || this.loadingMoreParts) return;
    this.loadingMoreParts = true;
    try {
      const result = await this.bomService.getPartNumbersPaginated(this.PART_PAGE_SIZE, this.lastPartDoc);
      const newUnique = this.filterUniquePartNumbers(result.rolls);
      this.filteredRolls = [...this.filteredRolls, ...newUnique];
      this.lastPartDoc = result.lastDoc;
      this.hasMoreParts = result.rolls.length === this.PART_PAGE_SIZE;
    } catch (e: any) {
      this.error = e.message;
    } finally {
      this.loadingMoreParts = false;
      this.cdr.detectChanges();
    }
  }

  async onSearchParts() {
    if (this.searchPart.trim().length !== 18) return;

    if (!this.searchPart.trim()) {
      this.isSearchingParts = false;
      this.searchPartExists = true;
      await this.loadFirstParts();
      return;
    }

    this.isSearchingParts = true;
    this.loadingMoreParts = true;

    try {
      const rolls = await this.bomService.searchPartNumbers(this.searchPart.trim());
      this.filteredRolls = this.filterUniquePartNumbers(rolls);

      // Verificar si el número exacto existe en SMT
      this.searchPartExists = this.filteredRolls.some(
        r => r.partNumber.toLowerCase() === this.searchPart.trim().toLowerCase()
      );

      this.hasMoreParts = false;
    } catch (e: any) {
      this.error = e.message;
    } finally {
      this.loadingMoreParts = false;
      this.cdr.detectChanges();
    }
  }

  async clearPartSearch() {
    this.searchPart = '';
    this.isSearchingParts = false;
    this.searchPartExists = true;
    await this.loadFirstParts();
  }

  filterUniquePartNumbers(rolls: SmtRoll[]): SmtRoll[] {
    const seen = new Set(this.filteredRolls.map(r => r.partNumber));
    return rolls.filter(r => {
      if (seen.has(r.partNumber)) return false;
      seen.add(r.partNumber);
      return true;
    });
  }

  // ── Actualizar openCreate y openEdit ──────────────────
  openCreate() {
    this.bomItems = [];
    this.bomForm.reset();
    this.searchPart = '';
    this.filteredRolls = [];
    this.lastPartDoc = null;
    this.hasMoreParts = true;
    this.isSearchingParts = false;
    this.loadFirstParts();
    this.view = 'create';
  }

  openEdit(bom: Bom) {
    this.selectedBom = bom;
    this.bomItems = [...bom.items];
    this.bomForm.patchValue({ name: bom.name, description: bom.description });
    this.searchPart = '';
    this.filteredRolls = [];
    this.lastPartDoc = null;
    this.hasMoreParts = true;
    this.isSearchingParts = false;
    this.loadFirstParts();
    this.view = 'edit';
  }

  // ── Actualizar goBack ─────────────────────────────────
  goBack() {
    this.view = 'list';
    this.error = '';
    this.bomItems = [];
    this.stockItems = [];
    this.selectedBom = null;
    this.outputStep = 'quantity';
    this.selectedRolls = [];
    this.pendingItems = [];
    this.currentStockIndex = 0;
    this.filteredRolls = [];
    this.searchPart = '';

    if (!this.isSearchingBoms) {
      this.loadFirstBoms();
    } else {
      this.boms = this.applyBomFilter(this.allLoadedBoms);
    }
  }

  async loadAllRolls() {
    try {
      let allRolls: SmtRoll[] = [];
      let lastDoc = null;
      let hasMore = true;

      // Cargar todos los rollos en lotes de 10 para construir la lista de números de parte
      while (hasMore) {
        const result: any = lastDoc
          ? await this.smtService.getRollsNextPage(10, lastDoc)
          : await this.smtService.getRollsPaginated(10);

        allRolls = [...allRolls, ...result.rolls];
        lastDoc = result.lastDoc;
        hasMore = result.rolls.length === 10;
      }

      this.allRolls = allRolls;
      this.filteredRolls = this.getUniquePartNumbers();
      this.cdr.detectChanges();
    } catch (e: any) {
      this.error = e.message;
    }
  }

  // ── Navegación ───────────────────────────────────────
  openDetail(bom: Bom) {
    this.selectedBom = bom;
    this.view = 'detail';
    this.loadStockForBom(bom);
  }

  openHistory(bom: Bom) {
    this.selectedBom = bom;
    this.movements$ = this.bomService.getMovements(bom.id!);
    this.view = 'history';
  }

  openOutput(bom: Bom) {
    this.selectedBom = bom;
    this.outputForm.reset({ quantity: 1 });
    this.outputStep = 'quantity';
    this.selectedRolls = [];
    this.pendingItems = [];
    this.error = '';
    this.view = 'output';
  }

  openSelectOutput() {
    this.error = '';
    this.view = 'select-output';
  }

  // ── Números de parte únicos ──────────────────────────
  getUniquePartNumbers(): SmtRoll[] {
    const seen = new Set<string>();
    return this.allRolls.filter(r => {
      if (seen.has(r.partNumber)) return false;
      seen.add(r.partNumber);
      return true;
    });
  }

  filterParts() {
    const unique = this.getUniquePartNumbers();
    if (!this.searchPart.trim()) {
      this.filteredRolls = unique;
      return;
    }
    this.filteredRolls = unique.filter(r =>
      r.partNumber.toLowerCase().includes(this.searchPart.toLowerCase())
    );
  }

  // ── Items del BOM ────────────────────────────────────
  addItem(partNumber: string, existsInSmt = true) {
    const exists = this.bomItems.find(i => i.partNumber === partNumber);
    if (exists) {
      this.error = `${partNumber} ya está en la receta`;
      setTimeout(() => this.error = '', 2000);
      return;
    }
    this.bomItems.push({ partNumber, quantityRequired: 1, existsInSmt });
    this.cdr.detectChanges();
  }

  addManualItem() {
    if (this.searchPart.trim().length !== 18) return;
    if (!this.searchPart.trim()) return;

    this.addItem(this.searchPart.trim().toUpperCase(), false); // ← false
    this.searchPart = '';
    this.isSearchingParts = false;
    this.searchPartExists = true;
    this.loadFirstParts();
  }

  processBulkInput() {
    if (!this.bulkInput.trim()) return;

    // Separar por salto de línea, coma o punto y coma
    const parts = this.bulkInput
      .split(/[\n,;]/)
      .map(p => p.trim())
      .filter(p => p.length > 0);

    let added = 0;
    let skipped = 0;
    let invalidLength = 0;

    for (const part of parts) {
      if (part.length !== 18) {
        invalidLength++;
        continue;
      }
      const exists = this.bomItems.find(i => i.partNumber === part);
      if (exists) {
        skipped++;
        continue;
      }
      const existsInSmt = this.allRolls.some(r => r.partNumber === part);
      this.bomItems.push({ partNumber: part, quantityRequired: 1, existsInSmt });
      added++;
    }

    // Resumen
    let msg = `${added} componente(s) agregado(s).`;
    if (skipped > 0) msg += ` ${skipped} duplicado(s) ignorado(s).`;
    if (invalidLength > 0) msg += ` ${invalidLength} con longitud incorrecta ignorado(s).`;
    this.success = msg;
    setTimeout(() => this.success = '', 4000);

    this.bulkInput = '';
    this.showBulkInput = false;
    this.cdr.detectChanges();
  }

  removeItem(partNumber: string) {
    this.bomItems = this.bomItems.filter(i => i.partNumber !== partNumber);
  }

  updateQuantity(partNumber: string, quantity: number) {
    const item = this.bomItems.find(i => i.partNumber === partNumber);
    if (item) item.quantityRequired = quantity;
  }

  // ── CRUD BOM ─────────────────────────────────────────
  async saveBom() {
    if (this.bomForm.invalid || this.bomItems.length === 0) {
      this.error = 'Agrega al menos un número de parte a la receta';
      return;
    }
    this.loading = true;
    this.error = '';

    try {
      const { name, description } = this.bomForm.value;
      const data = { name: name!, description: description || '', items: this.bomItems };

      if (this.view === 'edit' && this.selectedBom?.id) {
        await this.bomService.updateBom(this.selectedBom.id, data);
        this.success = 'BOM actualizado correctamente';
      } else {
        await this.bomService.addBom(data);
        this.success = 'BOM creado correctamente';
      }

      this.goBack();
      setTimeout(() => this.success = '', 3000);
    } catch (e: any) {
      this.error = e.message || 'Error al guardar el BOM';
    } finally {
      this.loading = false;
      await this.loadFirstBoms();
      this.cdr.detectChanges();
    }
  }

  async deleteBom(bom: Bom) {
    if (!confirm(`¿Eliminar BOM "${bom.name}"?`)) return;
    try {
      await this.bomService.deleteBom(bom.id!);
      this.success = 'BOM eliminado';
      setTimeout(() => this.success = '', 3000);
    } catch (e: any) {
      this.error = e.message;
    } finally {
      await this.loadFirstBoms();
      this.cdr.detectChanges();
    }
  }

  // ── Stock del detalle ────────────────────────────────
  async loadStockForBom(bom: Bom) {
    this.loading = true;
    try {
      this.stockItems = await this.bomService.checkStock(bom, 1);
    } catch (e: any) {
      this.error = e.message;
    } finally {
      this.loading = false;
      this.cdr.detectChanges();
    }
  }

  // ── Salida ───────────────────────────────────────────
  async checkStockForOutput() {
    if (this.outputForm.invalid || !this.selectedBom) return;
    this.loading = true;
    this.error = '';
    this.outputQuantity = this.outputForm.value.quantity!;

    try {
      const stockItems = await this.bomService.checkStock(this.selectedBom, this.outputQuantity);

      // Verificar si hay suficiente stock para todo
      const insufficient = stockItems.filter(i => !i.hasEnoughStock);
      if (insufficient.length > 0) {
        this.error = `Stock insuficiente para: ${insufficient.map(i =>
          `${i.partNumber} (necesita ${i.totalRequired}, hay ${i.totalStock})`
        ).join(', ')}`;
        return;
      }

      // Separar items que necesitan selección de ubicación (múltiples rolls)
      this.pendingItems = stockItems.filter(i => i.rolls.length > 1);
      const autoItems = stockItems.filter(i => i.rolls.length === 1);

      // Items con una sola ubicación se asignan automáticamente
      for (const item of autoItems) {
        this.selectedRolls.push({
          partNumber: item.partNumber,
          rollId: item.rolls[0].id,
          quantity: item.totalRequired
        });
      }

      if (this.pendingItems.length > 0) {
        this.currentStockIndex = 0;
        this.outputStep = 'locations';
      } else {
        this.outputStep = 'confirm';
      }
    } catch (e: any) {
      this.error = e.message || 'Error al verificar stock';
    } finally {
      this.loading = false;
      this.cdr.detectChanges();
    }
  }

  selectRollForItem(rollId: string) {
    const item = this.pendingItems[this.currentStockIndex];
    this.selectedRolls.push({
      partNumber: item.partNumber,
      rollId,
      quantity: item.totalRequired
    });

    if (this.currentStockIndex < this.pendingItems.length - 1) {
      this.currentStockIndex++;
    } else {
      this.outputStep = 'confirm';
    }
    this.cdr.detectChanges();
  }

  async confirmOutput() {
    if (!this.selectedBom) return;
    this.loading = true;
    this.error = '';

    try {
      await this.bomService.registerOutput(
        this.selectedBom,
        this.outputQuantity,
        this.selectedRolls
      );
      this.success = `Salida registrada — ${this.selectedBom.name} x${this.outputQuantity}`;
      this.goBack();
      setTimeout(() => this.success = '', 4000);
    } catch (e: any) {
      this.error = e.message || 'Error al registrar salida';
    } finally {
      this.loading = false;
      this.cdr.detectChanges();
    }
  }

  // Getter para ordenar items — primero los que existen en SMT
  get sortedStockItems(): BomStockItem[] {
    return [...this.stockItems].sort((a, b) => {
      if (a.totalStock > 0 && b.totalStock === 0) return -1;
      if (a.totalStock === 0 && b.totalStock > 0) return 1;
      return 0;
    });
  }

  openSingleOutput(item: BomStockItem) {
    this.singleOutputItem = item;
    this.singleOutputRollId = item.rolls.length === 1 ? item.rolls[0].id : '';
    this.singleOutputForm.reset({ quantity: null });
    this.showSingleOutputModal = true;
  }

  selectSingleRoll(rollId: string) {
    this.singleOutputRollId = rollId;
  }

  async confirmSingleOutput() {
    if (!this.singleOutputItem || !this.singleOutputRollId) return;
    const { quantity } = this.singleOutputForm.value;
    if (!quantity) return;

    this.loading = true;
    this.error = '';

    try {
      const roll = this.singleOutputItem.rolls.find(r => r.id === this.singleOutputRollId);
      if (!roll) throw new Error('Rollo no encontrado');

      if (quantity > roll.stock) {
        this.error = `Stock insuficiente. Disponible: ${roll.stock} pzs`;
        return;
      }

      await this.bomService.registerOutput(
        this.selectedBom!,
        1,
        [{
          partNumber: this.singleOutputItem.partNumber,
          rollId: this.singleOutputRollId,
          quantity
        }]
      );

      this.success = `Salida registrada — ${this.singleOutputItem.partNumber} (-${quantity} pzs)`;
      this.showSingleOutputModal = false;
      await this.loadStockForBom(this.selectedBom!);
      setTimeout(() => this.success = '', 3000);
    } catch (e: any) {
      this.error = e.message || 'Error al registrar salida';
    } finally {
      this.loading = false;
      this.cdr.detectChanges();
    }
  }

  get selectedRollStock(): number {
    if (!this.singleOutputItem || !this.singleOutputRollId) return 0;
    return this.singleOutputItem.rolls.find(r => r.id === this.singleOutputRollId)?.stock ?? 0;
  }

  // ── Exportación ───────────────────────────────────────
  async exportBoms() {
    const allBoms = await this.bomService.getAllBoms();

    // Hoja 1: Lista de BOMs
    const bomsData = allBoms.map(b => ({
      'Nombre': b.name,
      'Descripción': b.description || '—',
      'Componentes': b.items.length,
    }));

    // Hoja 2: Detalle de componentes por BOM
    const itemsData = allBoms.flatMap(b =>
      b.items.map(i => ({
        'BOM': b.name,
        'Número de Parte': i.partNumber,
        'Cantidad': i.quantityRequired,
        'En SMT': i.existsInSmt ? 'Sí' : 'No',
      }))
    );

    this.exportService.exportMultiSheet([
      { name: 'BOMs', data: bomsData },
      { name: 'Componentes', data: itemsData },
    ], 'BOMs');
  }

  async exportBomMovements() {
    const allMovements = await this.bomService.getAllMovementsOnce();

    const data = allMovements.map(m => ({
      'BOM': m.bomName,
      'Tipo': m.type === 'entrada' ? 'Entrada' : 'Salida',
      'Cantidad': m.quantity,
      'Usuario': m.userName,
      'Fecha': m.date?.toDate ? m.date.toDate().toLocaleString('es-MX') : '—',
    }));

    this.exportService.exportToExcel(data, 'BOM_Movimientos', 'Movimientos');
  }
}