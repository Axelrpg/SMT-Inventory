import { Component, inject, OnInit, ChangeDetectorRef } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators, FormsModule } from '@angular/forms';
import { AsyncPipe, DatePipe } from '@angular/common';
import { HilightService } from '../../../../core/services/hilight.service';
import { HLService } from '../../../../core/services/hl.service';
import { Observable } from 'rxjs';
import { AuthService } from '../../../../core/services/auth.service';
import { QueryDocumentSnapshot } from '@angular/fire/firestore';
import { ExportService } from '../../../../core/services/export.service';
import { HL, HLItem, HLStockItem } from '../../../../core/models/hl.model';
import { HilightRoll } from '../../../../core/models/hilight.model';

type View = 'list' | 'detail' | 'create' | 'edit' | 'output' | 'history' | 'select-output';

@Component({
  selector: 'app-hl-component',
  standalone: true,
  imports: [ReactiveFormsModule, FormsModule, AsyncPipe, DatePipe],
  templateUrl: './hl-component.html',
  styleUrl: './hl-component.css'
})
export class HlComponent implements OnInit {
  private hlService = inject(HLService);
  private hilightService = inject(HilightService);
  private authService = inject(AuthService);
  private exportService = inject(ExportService);
  private fb = inject(FormBuilder);
  private cdr = inject(ChangeDetectorRef);

  isAdmin = false;

  hls: HL[] = [];
  allRolls: HilightRoll[] = [];
  filteredRolls: HilightRoll[] = [];
  selectedHl: HL | null = null;
  hlItems: HLItem[] = [];
  stockItems: HLStockItem[] = [];
  movements$?: Observable<any[]>;

  lastHlDoc: QueryDocumentSnapshot | null = null;
  hasMoreHls = true;
  loadingMoreHls = false;
  isSearchingHls = false;
  searchHlName = '';
  readonly HL_PAGE_SIZE = 10;

  lastPartDoc: QueryDocumentSnapshot | null = null;
  hasMoreParts = true;
  loadingMoreParts = false;
  isSearchingParts = false;
  searchPartExists = true;
  readonly PART_PAGE_SIZE = 5;

  allLoadedHls: HL[] = [];
  hlPageSize = 10;
  hlPageSizeOptions = [10, 20, 50, 100, 0];

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
  outputLength = 1;
  currentStockIndex = 0; // índice del item que está seleccionando ubicación
  selectedRolls: { partNumber: string; rollId: string; length: number }[] = [];
  pendingItems: HLStockItem[] = []; // items que necesitan selección de ubicación

  // Salida individual
  showSingleOutputModal = false;
  singleOutputItem: HLStockItem | null = null;
  singleOutputForm = this.fb.group({
    length: [null, [Validators.required, Validators.min(1)]]
  });
  singleOutputRollId = '';

  hlForm = this.fb.group({
    name: ['', Validators.required],
    description: ['']
  });

  outputForm = this.fb.group({
    length: [1, [Validators.required, Validators.min(1)]]
  });

  async ngOnInit() {
    this.authService.currentUserWithRole$.subscribe(snap => {
      const data = (snap as any)?.data();
      this.isAdmin = data?.role === 'admin';
      this.cdr.detectChanges();
    });

    this.hlService.getHls().subscribe(hls => {
      // Solo para mantener referencia actualizada al editar/eliminar
    });
    await this.loadFirstHls();
  }

  async loadFirstHls() {
    this.loading = true;
    try {
      if (this.hlPageSize === 0) {
        const all = await this.hlService.getAllHls();
        this.allLoadedHls = all;
        this.hls = all;
        this.lastHlDoc = null;
        this.hasMoreHls = false;
      } else {
        const result = await this.hlService.getHlsPaginated(this.hlPageSize);
        this.allLoadedHls = result.hls;
        this.hls = result.hls;
        this.lastHlDoc = result.lastDoc;
        this.hasMoreHls = result.hls.length === this.hlPageSize;
      }
    } catch (e: any) {
      this.error = e.message;
    } finally {
      this.loading = false;
      this.cdr.detectChanges();
    }
  }

  async loadMoreHls() {
    if (!this.lastHlDoc || this.loadingMoreHls) return;
    this.loadingMoreHls = true;
    try {
      const result = await this.hlService.getHlsPaginated(this.hlPageSize, this.lastHlDoc);
      this.allLoadedHls = [...this.allLoadedHls, ...result.hls];
      this.hls = this.applyHlFilter(this.allLoadedHls);
      this.lastHlDoc = result.lastDoc;
      this.hasMoreHls = result.hls.length === this.hlPageSize;
    } catch (e: any) {
      this.error = e.message;
    } finally {
      this.loadingMoreHls = false;
      this.cdr.detectChanges();
    }
  }

  async onHlPageSizeChange(size: number) {
    this.hlPageSize = size;
    this.searchHlName = '';
    this.isSearchingHls = false;
    await this.loadFirstHls();
  }

  applyHlFilter(hls: HL[]): HL[] {
    if (!this.searchHlName.trim()) return hls;
    const s = this.searchHlName.trim().toLowerCase();
    return hls.filter(h =>
      h.name.toLowerCase().includes(s) ||
      (h.description?.toLowerCase().includes(s) ?? false)
    );
  }

  onSearchHls() {
    if (this.searchMode === 'partNumber') {
      this.onSearchHlsByPartNumber();
      return;
    }
    this.isSearchingHls = !!this.searchHlName.trim();
    this.hls = this.applyHlFilter(this.allLoadedHls);
    this.cdr.detectChanges();
  }

  async onSearchHlsByPartNumber() {
    if (!this.searchHlName.trim()) {
      this.isSearchingHls = false;
      await this.loadFirstHls();
      return;
    }
    this.isSearchingHls = true;
    this.loading = true;
    try {
      this.hls = await this.hlService.getHlsByPartNumber(this.searchHlName.trim());
      this.hasMoreHls = false;
    } catch (e: any) {
      this.error = e.message;
    } finally {
      this.loading = false;
      this.cdr.detectChanges();
    }
  }

  clearHlSearch() {
    this.searchHlName = '';
    this.isSearchingHls = false;
    this.hls = this.allLoadedHls;
    this.cdr.detectChanges();
  }

  // ── Paginado de números de parte ──────────────────────
  async loadFirstParts() {
    this.loadingMoreParts = true;
    try {
      const result = await this.hlService.getPartNumbersPaginated(this.PART_PAGE_SIZE);
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
      const result = await this.hlService.getPartNumbersPaginated(this.PART_PAGE_SIZE, this.lastPartDoc);
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
      const rolls = await this.hlService.searchPartNumbers(this.searchPart.trim());
      this.filteredRolls = this.filterUniquePartNumbers(rolls);

      // Verificar si el número exacto existe en Hilight
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

  filterUniquePartNumbers(rolls: HilightRoll[]): HilightRoll[] {
    const seen = new Set(this.filteredRolls.map(r => r.partNumber));
    return rolls.filter(r => {
      if (seen.has(r.partNumber)) return false;
      seen.add(r.partNumber);
      return true;
    });
  }

  // ── Actualizar openCreate y openEdit ──────────────────
  openCreate() {
    this.hlItems = [];
    this.hlForm.reset();
    this.searchPart = '';
    this.filteredRolls = [];
    this.lastPartDoc = null;
    this.hasMoreParts = true;
    this.isSearchingParts = false;
    this.loadFirstParts();
    this.view = 'create';
  }

  openEdit(hl: HL) {
    this.selectedHl = hl;
    this.hlItems = [...hl.items];
    this.hlForm.patchValue({ name: hl.name, description: hl.description });
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
    this.hlItems = [];
    this.stockItems = [];
    this.selectedHl = null;
    this.outputStep = 'quantity';
    this.selectedRolls = [];
    this.pendingItems = [];
    this.currentStockIndex = 0;
    this.filteredRolls = [];
    this.searchPart = '';

    if (!this.isSearchingHls) {
      this.loadFirstHls();
    } else {
      this.hls = this.applyHlFilter(this.allLoadedHls);
    }
  }

  async loadAllRolls() {
    try {
      let allRolls: HilightRoll[] = [];
      let lastDoc = null;
      let hasMore = true;

      // Cargar todos los rollos en lotes de 10 para construir la lista de números de parte
      while (hasMore) {
        const result: any = lastDoc
          ? await this.hilightService.getRollsNextPage(10, lastDoc)
          : await this.hilightService.getRollsPaginated(10);

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
  openDetail(hl: HL) {
    this.selectedHl = hl;
    this.view = 'detail';
    this.loadStockForHl(hl);
  }

  openHistory(hl: HL) {
    this.selectedHl = hl;
    this.movements$ = this.hlService.getMovements(hl.id!);
    this.view = 'history';
  }

  openOutput(hl: HL) {
    this.selectedHl = hl;
    this.outputForm.reset({ length: 1 });
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
  getUniquePartNumbers(): HilightRoll[] {
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

  // ── Items del HL ────────────────────────────────────
  addItem(partNumber: string, existsInHilight = true) {
    const exists = this.hlItems.find(i => i.partNumber === partNumber);
    if (exists) {
      this.error = `${partNumber} ya está en la receta`;
      setTimeout(() => this.error = '', 2000);
      return;
    }
    this.hlItems.push({ partNumber, lengthRequired: 1, existsInHilight });
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
      const exists = this.hlItems.find(i => i.partNumber === part);
      if (exists) {
        skipped++;
        continue;
      }
      const existsInHilight = this.allRolls.some(r => r.partNumber === part);
      this.hlItems.push({ partNumber: part, lengthRequired: 1, existsInHilight });
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
    this.hlItems = this.hlItems.filter(i => i.partNumber !== partNumber);
  }

  updateLength(partNumber: string, length: number) {
    const item = this.hlItems.find(i => i.partNumber === partNumber);
    if (item) item.lengthRequired = length;
  }

  // ── CRUD HL ─────────────────────────────────────────
  async saveHl() {
    if (this.hlForm.invalid || this.hlItems.length === 0) {
      this.error = 'Agrega al menos un número de parte a la receta';
      return;
    }
    this.loading = true;
    this.error = '';

    try {
      const { name, description } = this.hlForm.value;
      const data = { name: name!, description: description || '', items: this.hlItems };

      if (this.view === 'edit' && this.selectedHl?.id) {
        await this.hlService.updateHL(this.selectedHl.id, data);
        this.success = 'HL actualizado correctamente';
      } else {
        await this.hlService.addHL(data);
        this.success = 'HL creado correctamente';
      }

      this.goBack();
      setTimeout(() => this.success = '', 3000);
    } catch (e: any) {
      this.error = e.message || 'Error al guardar el HL';
    } finally {
      this.loading = false;
      await this.loadFirstHls();
      this.cdr.detectChanges();
    }
  }

  async deleteHl(hl: HL) {
    if (!confirm(`¿Eliminar HL "${hl.name}"?`)) return;
    try {
      await this.hlService.deleteHL(hl.id!);
      this.success = 'HL eliminado';
      setTimeout(() => this.success = '', 3000);
    } catch (e: any) {
      this.error = e.message;
    } finally {
      await this.loadFirstHls();
      this.cdr.detectChanges();
    }
  }

  // ── Stock del detalle ────────────────────────────────
  async loadStockForHl(hl: HL) {
    this.loading = true;
    try {
      this.stockItems = await this.hlService.checkStock(hl, 1);
    } catch (e: any) {
      this.error = e.message;
    } finally {
      this.loading = false;
      this.cdr.detectChanges();
    }
  }

  // ── Salida ───────────────────────────────────────────
  async checkLengthForOutput() {
    if (this.outputForm.invalid || !this.selectedHl) return;
    this.loading = true;
    this.error = '';
    this.outputLength = this.outputForm.value.length!;

    try {
      const stockItems = await this.hlService.checkStock(this.selectedHl, this.outputLength);

      // Verificar si hay suficiente stock para todo
      const insufficient = stockItems.filter(i => !i.hasEnoughLength);
      if (insufficient.length > 0) {
        this.error = `Stock insuficiente para: ${insufficient.map(i =>
          `${i.partNumber} (necesita ${i.totalRequired}, hay ${i.totalLength})`
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
          length: item.totalRequired
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
      length: item.totalRequired
    });

    if (this.currentStockIndex < this.pendingItems.length - 1) {
      this.currentStockIndex++;
    } else {
      this.outputStep = 'confirm';
    }
    this.cdr.detectChanges();
  }

  async confirmOutput() {
    if (!this.selectedHl) return;
    this.loading = true;
    this.error = '';

    try {
      await this.hlService.registerOutput(
        this.selectedHl,
        this.outputLength,
        this.selectedRolls
      );
      this.success = `Salida registrada — ${this.selectedHl.name} x${this.outputLength}`;
      this.goBack();
      setTimeout(() => this.success = '', 4000);
    } catch (e: any) {
      this.error = e.message || 'Error al registrar salida';
    } finally {
      this.loading = false;
      this.cdr.detectChanges();
    }
  }

  // Getter para ordenar items — primero los que existen en Hilight
  get sortedStockItems(): HLStockItem[] {
    return [...this.stockItems].sort((a, b) => {
      if (a.totalLength > 0 && b.totalLength === 0) return -1;
      if (a.totalLength === 0 && b.totalLength > 0) return 1;
      return 0;
    });
  }

  openSingleOutput(item: HLStockItem) {
    this.singleOutputItem = item;
    this.singleOutputRollId = item.rolls.length === 1 ? item.rolls[0].id : '';
    this.singleOutputForm.reset({ length: null });
    this.showSingleOutputModal = true;
  }

  selectSingleRoll(rollId: string) {
    this.singleOutputRollId = rollId;
  }

  async confirmSingleOutput() {
    if (!this.singleOutputItem || !this.singleOutputRollId) return;
    const { length } = this.singleOutputForm.value;
    if (!length) return;

    this.loading = true;
    this.error = '';

    try {
      const roll = this.singleOutputItem.rolls.find(r => r.id === this.singleOutputRollId);
      if (!roll) throw new Error('Rollo no encontrado');

      if (length > roll.length) {
        this.error = `Stock insuficiente. Disponible: ${roll.length} pzs`;
        return;
      }

      await this.hlService.registerOutput(
        this.selectedHl!,
        1,
        [{
          partNumber: this.singleOutputItem.partNumber,
          rollId: this.singleOutputRollId,
          length: length
        }]
      );

      this.success = `Salida registrada — ${this.singleOutputItem.partNumber} (-${length} pzs)`;
      this.showSingleOutputModal = false;
      await this.loadStockForHl(this.selectedHl!);
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
    return this.singleOutputItem.rolls.find(r => r.id === this.singleOutputRollId)?.length ?? 0;
  }

  // ── Exportación ───────────────────────────────────────
  async exportHls() {
    const allHls = await this.hlService.getAllHls();

    // Hoja 1: Lista de HLS
    const hlsData = allHls.map(h => ({
      'Nombre': h.name,
      'Descripción': h.description || '—',
      'Componentes': h.items.length,
    }));

    // Hoja 2: Detalle de componentes por HL
    const itemsData = allHls.flatMap(h =>
      h.items.map(i => ({
        'HL': h.name,
        'Número de Parte': i.partNumber,
        'Cantidad': i.lengthRequired,
        'Stock': i.existsInHilight ? 'Sí' : 'No',
      }))
    );

    this.exportService.exportMultiSheet([
      { name: 'HLS', data: hlsData },
      { name: 'Componentes', data: itemsData }, 
    ], 'HLS_Exportados');
  }

  async exportHlMovements() {
    const allMovements = await this.hlService.getAllMovementsOnce();

    const data = allMovements.map(m => ({
      'HL': m.hlName,
      'Tipo': m.type === 'input' ? 'Entrada' : 'Salida',
      'Cantidad': m.quantity,
      'Usuario': m.userName,
      'Fecha': m.date?.toDate ? m.date.toDate().toLocaleString('es-MX') : '—',
    }));

    this.exportService.exportToExcel(data, 'HL_Movimientos', 'Movimientos');
  }
}