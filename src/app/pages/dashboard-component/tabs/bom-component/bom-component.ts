import { Component, inject, OnInit, ChangeDetectorRef } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators, FormsModule } from '@angular/forms';
import { AsyncPipe, DatePipe } from '@angular/common';
import { BomService } from '../../../../core/services/bom.service';
import { SmtService } from '../../../../core/services/smt.service';
import { Bom, BomItem, BomStockItem } from '../../../../core/models/bom.model';
import { SmtRoll } from '../../../../core/models/smt.model';
import { Observable } from 'rxjs';
import { AuthService } from '../../../../core/services/auth.service';

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

  view: View = 'list';
  loading = false;
  error = '';
  success = '';
  searchPart = '';

  // Para salida — selección de rollos por ubicación
  outputStep: 'quantity' | 'locations' | 'confirm' = 'quantity';
  outputQuantity = 1;
  currentStockIndex = 0; // índice del item que está seleccionando ubicación
  selectedRolls: { partNumber: string; rollId: string; quantity: number }[] = [];
  pendingItems: BomStockItem[] = []; // items que necesitan selección de ubicación

  bomForm = this.fb.group({
    name: ['', Validators.required],
    description: ['']
  });

  outputForm = this.fb.group({
    quantity: [1, [Validators.required, Validators.min(1)]]
  });

  ngOnInit() {
    this.authService.currentUserWithRole$.subscribe(snap => {
      const data = (snap as any)?.data();
      this.isAdmin = data?.role === 'admin';
      this.cdr.detectChanges();
    })

    this.bomService.getBoms().subscribe(boms => {
      this.boms = boms;
      this.cdr.detectChanges();
    });

    this.smtService.getRolls().subscribe(rolls => {
      this.allRolls = rolls;
      this.cdr.detectChanges();
    });
  }

  // ── Navegación ───────────────────────────────────────
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
  }

  openDetail(bom: Bom) {
    this.selectedBom = bom;
    this.view = 'detail';
    this.loadStockForBom(bom);
  }

  openCreate() {
    this.bomItems = [];
    this.bomForm.reset();
    this.searchPart = '';
    this.filteredRolls = this.getUniquePartNumbers();
    this.view = 'create';
  }

  openEdit(bom: Bom) {
    this.selectedBom = bom;
    this.bomItems = [...bom.items];
    this.bomForm.patchValue({ name: bom.name, description: bom.description });
    this.searchPart = '';
    this.filteredRolls = this.getUniquePartNumbers();
    this.view = 'edit';
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
  addItem(partNumber: string) {
    const exists = this.bomItems.find(i => i.partNumber === partNumber);
    if (exists) {
      this.error = `${partNumber} ya está en la receta`;
      setTimeout(() => this.error = '', 2000);
      return;
    }
    this.bomItems.push({ partNumber, quantityRequired: 1 });
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
}