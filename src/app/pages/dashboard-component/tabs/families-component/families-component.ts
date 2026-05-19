import { Component, inject, OnInit, ChangeDetectorRef } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { FormsModule } from '@angular/forms';
import { FamilyService } from '../../../../core/services/family.service';
import { Family } from '../../../../core/models/family.model';
import { QueryDocumentSnapshot } from '@angular/fire/firestore';

@Component({
  selector: 'app-families-component',
  standalone: true,
  imports: [ReactiveFormsModule, FormsModule],
  templateUrl: './families-component.html',
  styleUrl: './families-component.css'
})
export class FamiliesComponent implements OnInit {
  private familyService = inject(FamilyService);
  private fb = inject(FormBuilder);
  private cdr = inject(ChangeDetectorRef);

  // ── Lista ─────────────────────────────────────────────
  allLoadedItems: Family[] = [];
  filteredItems: Family[] = [];
  lastDoc: QueryDocumentSnapshot | null = null;
  hasMore = true;
  loading = false;
  loadingMore = false;
  pageSize = 10;
  pageSizeOptions = [5, 10, 20, 50, 0];

  // ── Búsqueda ──────────────────────────────────────────
  searchText = '';
  isSearching = false;

  showBulkInput = false;
  showBulkModal = false;
  bulkInput = '';

  // ── Estado ────────────────────────────────────────────
  error = '';
  success = '';
  showModal = false;
  editingItem: Family | null = null;

  familyForm = this.fb.group({
    name: ['', Validators.required],
    partNumber: ['', Validators.required],
  });

  async ngOnInit() {
    await this.loadFirstPage();
  }

  // ── Paginado ──────────────────────────────────────────
  async loadFirstPage() {
    this.loading = true;
    try {
      if (this.pageSize === 0) {
        const all = await this.familyService.getAll();
        this.allLoadedItems = all;
        this.filteredItems = all;
        this.lastDoc = null;
        this.hasMore = false;
      } else {
        const result = await this.familyService.getPaginated(this.pageSize);
        this.allLoadedItems = result.items;
        this.filteredItems = result.items;
        this.lastDoc = result.lastDoc;
        this.hasMore = result.items.length === this.pageSize;
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
      const result = await this.familyService.getPaginated(this.pageSize, this.lastDoc);
      this.allLoadedItems = [...this.allLoadedItems, ...result.items];
      this.filteredItems = this.applyFilter(this.allLoadedItems);
      this.lastDoc = result.lastDoc;
      this.hasMore = result.items.length === this.pageSize;
    } catch (e: any) {
      this.error = e.message;
    } finally {
      this.loadingMore = false;
      this.cdr.detectChanges();
    }
  }

  async onPageSizeChange(size: number) {
    this.pageSize = size;
    this.searchText = '';
    this.isSearching = false;
    await this.loadFirstPage();
  }

  // ── Búsqueda ──────────────────────────────────────────
  applyFilter(items: Family[]): Family[] {
    if (!this.searchText.trim()) return items;
    const s = this.searchText.trim().toLowerCase();
    return items.filter(i =>
      i.name.toLowerCase().includes(s) ||
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
    this.filteredItems = this.allLoadedItems;
    this.cdr.detectChanges();
  }

  // ── Modal ─────────────────────────────────────────────
  openCreateModal() {
    this.editingItem = null;
    this.familyForm.reset();
    this.error = '';
    this.showModal = true;
  }

  openEditModal(item: Family) {
    this.editingItem = item;
    this.familyForm.patchValue({
      name: item.name,
      partNumber: item.partNumber
    });
    this.error = '';
    this.showModal = true;
  }

  closeModal() {
    this.showModal = false;
    this.error = '';
  }

  // ── CRUD ──────────────────────────────────────────────
  async save() {
    if (this.familyForm.invalid) return;
    this.loading = true;
    this.error = '';

    try {
      const { name, partNumber } = this.familyForm.value;

      // Verificar que el número de parte no esté en otra familia
      const existing = await this.familyService.getByPartNumber(partNumber!);
      if (existing && existing.id !== this.editingItem?.id) {
        this.error = `El número de parte ${partNumber} ya pertenece a la familia "${existing.name}"`;
        return;
      }

      if (this.editingItem?.id) {
        await this.familyService.update(this.editingItem.id, {
          name: name!,
          partNumber: partNumber!
        });
        this.success = 'Familia actualizada';
      } else {
        await this.familyService.add({ name: name!, partNumber: partNumber! });
        this.success = 'Familia creada';
      }

      this.showModal = false;
      await this.loadFirstPage();
      setTimeout(() => this.success = '', 3000);
    } catch (e: any) {
      this.error = e.message || 'Error al guardar';
    } finally {
      this.loading = false;
      this.cdr.detectChanges();
    }
  }

  async deleteItem(item: Family) {
    if (!confirm(`¿Eliminar familia "${item.name}"?`)) return;
    try {
      await this.familyService.delete(item.id!);
      this.success = 'Familia eliminada';
      await this.loadFirstPage();
      setTimeout(() => this.success = '', 3000);
    } catch (e: any) {
      this.error = e.message;
    } finally {
      this.cdr.detectChanges();
    }
  }

  processBulkInput() {
    if (!this.bulkInput.trim()) return;
    this.loading = true;

    const lines = this.bulkInput
      .split('\n')
      .map(l => l.trim())
      .filter(l => l.length > 0);

    let added = 0;
    let invalid = 0;
    const promises: Promise<any>[] = [];

    for (const line of lines) {
      const parts = line.split(/[,;\t]/).map(p => p.trim());

      if (parts.length < 2 || !parts[0] || !parts[1]) {
        invalid++;
        continue;
      }

      const name = parts[0];
      const partNumber = parts[1];

      promises.push(
        this.familyService.getByPartNumber(partNumber).then(existing => {
          if (existing) return;
          return this.familyService.add({ name, partNumber });
        })
      );
      added++;
    }

    Promise.all(promises).then(async () => {
      this.success = `${added} familia(s) procesada(s).${invalid > 0 ? ` ${invalid} línea(s) con formato incorrecto ignorada(s).` : ''}`;
      this.bulkInput = '';
      this.showBulkModal = false; // ← cerrar modal
      await this.loadFirstPage();
      setTimeout(() => this.success = '', 4000);
      this.cdr.detectChanges();
    }).catch(e => {
      this.error = e.message || 'Error al procesar la carga masiva';
      this.cdr.detectChanges();
    }).finally(() => {
      this.loading = false;
      this.cdr.detectChanges();
    });
  }
}