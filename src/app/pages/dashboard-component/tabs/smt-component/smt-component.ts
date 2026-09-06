import { Component, inject, OnInit, ChangeDetectorRef } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators, FormsModule } from '@angular/forms';
import { AsyncPipe, DatePipe } from '@angular/common';
import { SmtService } from '../../../../core/services/smt.service';
import { SmtRoll, SmtMovement, BulkOutputItem, BulkInputItem } from '../../../../core/models/smt.model';
import { Observable } from 'rxjs';
import { AuthService } from '../../../../core/services/auth.service';
import { QueryDocumentSnapshot } from '@angular/fire/firestore';
import { ExportService } from '../../../../core/services/export.service';
import { QrScannerComponent } from '../../../../shared/qr-scanner/qr-scanner';

type View = 'list' | 'input' | 'output' | 'history' | 'bulk-input' | 'bulk-output';
type InputMode = 'manual' | 'camera';

@Component({
  selector: 'app-smt-component',
  standalone: true,
  imports: [ReactiveFormsModule, FormsModule, AsyncPipe, DatePipe, QrScannerComponent],
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
  filteredRolls: SmtRoll[] = [];  // rollos filtrados para mostrar
  allLoadedRolls: SmtRoll[] = []; // todos los rollos cargados

  lastDoc: QueryDocumentSnapshot | null = null;
  hasMore = true;
  loadingMore = false;

  pageSize = 10;
  pageSizeOptions = [10, 20, 50, 100, 0]; // 0 = todos

  searchPartNumber = '';
  isSearching = false;
  searchScannerEnabled = false;

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

  // Variables para manejo de texto masivo
  bulkInputText = '';
  bulkOutputText = '';
  defaultInputLocation = 'CAJA01';
  uploadProgress: number = 0;
  outputProgress: number = 0;
  searchProgress: number = 0;

  bulkInputList: BulkInputItem[] = [];
  bulkOutputList: BulkOutputItem[] = [];

  // ── Salida rapida ─────────────────────────────────────
  showQuickOutputModal = false;
  quickOutputItem: SmtRoll | null = null;
  quickOutputForm = this.fb.group({
    quantity: [null as number | null, [Validators.required, Validators.min(1)]]
  });

  familyMap = new Map<string, string>(); // partNumber → familyName
  familyForInput: string | null = null;

  // Formulario entrada
  inputForm = this.fb.group({
    partNumber: ['', [Validators.required, Validators.minLength(18), Validators.maxLength(18)]],
    quantity: [null as number | null, [Validators.required, Validators.min(1)]],
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
    partNumber: ['', [Validators.required, Validators.minLength(18), Validators.maxLength(18)]],
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
      // Si pageSize es 0, cargar todos
      if (this.pageSize === 0) {
        const all = await this.smtService.getAllRolls();
        this.allLoadedRolls = all;
        this.filteredRolls = all;
        this.lastDoc = null;
        this.hasMore = false;
      } else {
        const result = await this.smtService.getRollsPaginated(this.pageSize);
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
      const result = await this.smtService.getRollsNextPage(this.pageSize, this.lastDoc);
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

  // ── Búsqueda ─────────────────────────────────────────
  onSearch() {
    if (!this.searchPartNumber.trim()) {
      this.isSearching = false;
      this.filteredRolls = this.allLoadedRolls;
      this.cdr.detectChanges();
      return;
    }
    this.isSearching = true;
    this.filteredRolls = this.applyFilter(this.allLoadedRolls);
    this.cdr.detectChanges();
  }

  applyFilter(rolls: SmtRoll[]): SmtRoll[] {
    if (!this.searchPartNumber.trim()) return rolls;

    const search = this.searchPartNumber.trim().toLocaleLowerCase()
    return rolls.filter(r => {
      const matchPartNumber = r.partNumber.toLocaleLowerCase().includes(search)
      const matchLocation = r.location ? r.location.toLocaleLowerCase().includes(search) : false
      return matchPartNumber || matchLocation;
    })
  }

  clearSearch() {
    this.searchPartNumber = '';
    this.isSearching = false;
    this.searchScannerEnabled = false;
    this.filteredRolls = this.allLoadedRolls;
    this.cdr.detectChanges();
  }

  // ── Escáner de búsqueda ──────────────────────────────
  toggleSearchScanner() {
    this.searchScannerEnabled = !this.searchScannerEnabled;
  }

  async onSearchCodeScanned(code: string) {
    if (!code) return;
    this.searchScannerEnabled = false;

    let parsedCode = code.trim();

    if (parsedCode.includes('$')) {
      const parts = parsedCode.split('$');
      if (parts.length > 1) {
        parsedCode = parts[1].substring(0, 18).trim();
      }
    }

    this.searchPartNumber = parsedCode;
    this.onSearch();
  }

  async onPageSizeChange(size: number) {
    this.pageSize = size;
    this.searchPartNumber = '';
    this.isSearching = false;
    await this.loadFirstPage();
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
      this.loadFirstPage();
    } else {
      this.filteredRolls = this.applyFilter(this.allLoadedRolls);
    }
  }

  openInput() {
    this.view = 'input';
    this.inputMode = 'manual';
    this.error = '';
    this.inputForm.reset({ quantity: null });
  }

  openBulkInput() {
    this.view = 'bulk-input';
    this.bulkInputList = [];
    this.bulkInputText = '';
    this.error = '';
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

  openBulkOutput() {
    this.view = 'bulk-output';
    this.bulkOutputList = [];
    this.bulkOutputText = '';
    this.error = '';
  }

  openQuickOutput(item: SmtRoll) {
    this.quickOutputItem = item;
    this.quickOutputForm.reset({ quantity: null });
    this.error = '';
    this.showQuickOutputModal = true;
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

    if (this.view === 'input') {
      // Intentar parsear como DataMatrix con $
      const parsed = this.parseDataMatrix(code);
      if (parsed) {
        // DataMatrix — llenar número de parte y cantidad automáticamente
        this.inputForm.patchValue({
          partNumber: parsed.partNumber.substring(0, 18),
          quantity: parsed.quantity as any
        });
        this.success = `DataMatrix leído — ${parsed.partNumber} (${parsed.quantity} pzs)`;
        setTimeout(() => this.success = '', 3000);
      } else {
        // QR normal — llenar solo el campo apuntado
        const trimmed = code.substring(0, 18);
        if (this.scanTarget === 'partNumber') {
          this.inputForm.patchValue({ partNumber: trimmed });
        } else {
          this.inputForm.patchValue({ location: trimmed });
        }
      }
    }

    if (this.view === 'output') {
      const trimmed = code.substring(0, 18);
      if (this.scanTarget === 'partNumber') {
        this.outputForm.patchValue({ partNumber: trimmed });
      } else {
        this.outputForm.patchValue({ location: trimmed });
      }
    }

    this.cdr.detectChanges();
  }

  parseDataMatrix(raw: string): { partNumber: string; quantity: number } | null {
    const parts = raw.split('$');

    // Necesitamos al menos 5 partes
    if (parts.length < 5) return null;

    const partNumber = parts[1]?.trim();
    const quantityStr = parts[4]?.trim();
    const quantity = parseInt(quantityStr, 10);

    if (!partNumber || isNaN(quantity)) return null;

    return { partNumber, quantity };
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

  processBulkInputText() {
    if (!this.bulkInputText.trim()) return;

    const lines = this.bulkInputText.split('\n');
    const newList: BulkInputItem[] = [];

    for (let line of lines) {
      line = line.trim();
      if (!line) continue;

      // Option 1: Formato DataMatrix ($)
      const dmParsed = this.parseDataMatrix(line);
      if (dmParsed) {
        newList.push({
          partNumber: dmParsed.partNumber.substring(0, 18),
          quantity: dmParsed.quantity,
          location: this.defaultInputLocation
        });
        continue;
      }

      // Option 2: Formato separado por espacios, comas, punto y coma o tabuladores
      // Ejemplos válidos:
      // 123456789012345678 50 RACK-1
      // 123456789012345678, 50, RACK-1
      const parts = line.split(/[\s,;]+/).map(p => p.trim()).filter(Boolean);
      const partNumber = parts[0]?.substring(0, 18);
      const quantity = parseInt(parts[1], 10) || 1;
      const location = parts[2] || this.defaultInputLocation;

      if (partNumber) {
        newList.push({ partNumber, quantity, location });
      }
    }

    this.bulkInputList = [...this.bulkInputList, ...newList];
    this.bulkInputText = ''; // Limpiar el textarea tras procesar
    this.cdr.detectChanges();
  }

  removeBulkInputItem(index: number) {
    this.bulkInputList.splice(index, 1);
  }

  async confirmBulkInput() {
    if (this.bulkInputList.length === 0) return;
    this.loading = true;
    this.error = '';
    this.uploadProgress = 0; // Reiniciar progreso

    try {
      // Pasamos la lista y una función que recibirá el progreso
      await this.smtService.registerBulkInput(this.bulkInputList, (current, total) => {
        // Calculamos el porcentaje
        this.uploadProgress = Math.round((current / total) * 100);
        this.cdr.detectChanges(); // Forzamos a Angular a dibujar la barra actualizada
      });

      this.success = `Entradas masivas registradas con éxito (${this.bulkInputList.length} líneas)`;
      this.goBack();
      setTimeout(() => this.success = '', 4000);
    } catch (e: any) {
      this.error = e.message || 'Error al procesar las entradas masivas';
    } finally {
      this.loading = false;
      this.uploadProgress = 0;
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

  async saveQuickOutput() {
    if (this.quickOutputForm.invalid || !this.quickOutputItem?.id) return;
    this.loading = true;
    this.error = '';

    try {
      const { quantity } = this.quickOutputForm.value;

      if (quantity! > this.quickOutputItem.quantity) {
        this.error = `Stock insuficiente. Disponible: ${this.quickOutputItem.quantity} pzs`;
        return;
      }

      await this.smtService.registerMovement(
        this.quickOutputItem.id!,
        this.quickOutputItem.partNumber,
        'salida',
        quantity!
      );

      this.success = `Salida registrada — ${this.quickOutputItem.location} (-${quantity} pzs)`;
      this.showQuickOutputModal = false;

      const idx = this.allLoadedRolls.findIndex(i => i.id === this.quickOutputItem!.id);
      if (idx !== -1) {
        this.allLoadedRolls[idx] = {
          ...this.allLoadedRolls[idx],
          quantity: this.allLoadedRolls[idx].quantity - quantity!
        };
        this.filteredRolls = this.applyFilter(this.allLoadedRolls);
      }

      setTimeout(() => this.success = '', 3000);
    } catch (e: any) {
      this.error = e.message || 'Error al registrar salida';
    } finally {
      this.loading = false;
      this.cdr.detectChanges();
    }
  }

  // ── Procesamiento de Texto: SALIDA ─────────────────────
  async processBulkOutputText() {
    if (!this.bulkOutputText.trim()) return;
    this.loading = true;
    this.error = '';
    this.searchProgress = 0;

    const lines = this.bulkOutputText.split('\n');
    const rawRequested: { partNumber: string, quantity: number }[] = [];

    // 1. Parsear el texto
    for (let line of lines) {
      line = line.trim();
      if (!line) continue;

      const parts = line.split(/[\s,;]+/).map(p => p.trim()).filter(Boolean);
      const partNumber = parts[0]?.substring(0, 18);
      const quantity = parseInt(parts[1], 10) || 1;

      if (partNumber) {
        rawRequested.push({ partNumber, quantity });
      }
    }

    if (rawRequested.length === 0) {
      this.loading = false;
      return;
    }

    // 2. Consolidar peticiones duplicadas del mismo número de parte
    const requestedMap = new Map<string, number>();
    for (const item of rawRequested) {
      const current = requestedMap.get(item.partNumber) || 0;
      requestedMap.set(item.partNumber, current + item.quantity);
    }

    try {
      const uniquePartNumbers = Array.from(requestedMap.keys());

      // Consultar Firebase con barra de progreso
      const availableRolls = await this.smtService.getRollsByPartNumbers(
        uniquePartNumbers,
        (current, total) => {
          this.searchProgress = Math.round((current / total) * 100);
          this.cdr.detectChanges();
        }
      );

      const errors: string[] = [];

      // 3. Distribuir el consumo entre los rollos disponibles
      for (const [partNumber, neededQty] of requestedMap.entries()) {
        // Filtrar todos los rollos activos para esta parte
        const rollsForPart = availableRolls.filter(r => r.partNumber === partNumber && r.quantity > 0);
        const totalStock = rollsForPart.reduce((acc, r) => acc + r.quantity, 0);

        if (totalStock === 0) {
          errors.push(`Sin stock disponible: ${partNumber}`);
          continue;
        }

        if (neededQty > totalStock) {
          errors.push(`Stock insuficiente para ${partNumber} (Pediste: ${neededQty}, Disponible total: ${totalStock})`);
          continue;
        }

        // Consumir el stock rollo por rollo hasta cubrir lo requerido
        let remainingToWithdraw = neededQty;

        for (const roll of rollsForPart) {
          if (remainingToWithdraw <= 0) break;

          const takeFromThisRoll = Math.min(roll.quantity, remainingToWithdraw);
          const existing = this.bulkOutputList.find(i => i.rollId === roll.id);

          if (existing) {
            existing.quantity += takeFromThisRoll;
          } else {
            this.bulkOutputList.push({
              rollId: roll.id!,
              partNumber: roll.partNumber,
              location: roll.location,
              quantity: takeFromThisRoll,
              maxQuantity: roll.quantity
            });
          }

          remainingToWithdraw -= takeFromThisRoll;
        }
      }

      if (errors.length > 0) {
        this.error = "Algunos ítems no se agregaron:\n" + errors.join('\n');
      }

      this.bulkOutputText = '';
    } catch (e: any) {
      this.error = e.message || 'Error al buscar los rollos de salida';
    } finally {
      this.loading = false;
      this.searchProgress = 0;
      this.cdr.detectChanges();
    }
  }

  removeBulkOutputItem(index: number) {
    this.bulkOutputList.splice(index, 1);
  }

  async confirmBulkOutput() {
    if (this.bulkOutputList.length === 0) return;
    this.loading = true;
    this.error = '';
    this.outputProgress = 0; // Reiniciar progreso

    try {
      // Pasamos la lista y el callback del progreso al servicio
      await this.smtService.registerBulkOutput(this.bulkOutputList, (current, total) => {
        this.outputProgress = Math.round((current / total) * 100);
        this.cdr.detectChanges(); // Refrescar la vista
      });

      this.success = `Salidas masivas registradas con éxito (${this.bulkOutputList.length} ítems)`;
      this.goBack(); // Limpia la lista y regresa al menú
      setTimeout(() => this.success = '', 4000);
    } catch (e: any) {
      this.error = e.message || 'Error al procesar las salidas masivas';
    } finally {
      this.loading = false;
      // Puedes reiniciar la barra al final si lo deseas
      this.outputProgress = 0;
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
    this.editForm.patchValue({
      partNumber: roll.partNumber,
      quantity: roll.quantity,
      location: roll.location
    });
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
      'Usuario': m.userName,
      'Fecha': m.date?.toDate ? m.date.toDate().toLocaleString('es-MX') : '—',
    }));

    this.exportService.exportToExcel(data, 'SMT_Movimientos', 'Movimientos');
  }
}