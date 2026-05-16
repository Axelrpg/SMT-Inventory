import { Component, inject, OnInit, ChangeDetectorRef } from '@angular/core';
import { DatePipe, UpperCasePipe } from '@angular/common';
import { SmtService } from '../../../../core/services/smt.service';
import { BomService } from '../../../../core/services/bom.service';
import { UnifiedMovement } from '../../../../core/models/unified-movement.model';
import { QueryDocumentSnapshot } from '@angular/fire/firestore';
import { ExportService } from '../../../../core/services/export.service';

@Component({
  selector: 'app-history-component',
  imports: [DatePipe, UpperCasePipe],
  templateUrl: './history-component.html',
  styleUrl: './history-component.css',
})
export class HistoryComponent implements OnInit {
  private smtService = inject(SmtService);
  private bomService = inject(BomService);
  private exportService = inject(ExportService);
  private cdr = inject(ChangeDetectorRef);

  movements: UnifiedMovement[] = [];
  loading = false;
  loadingMore = false;
  error = '';
  hasMore = true;

  readonly PAGE_SIZE = 20;
  private lastSmtDoc: QueryDocumentSnapshot | null = null;
  private lastBomDoc: QueryDocumentSnapshot | null = null;
  private smtExhausted = false;
  private bomExhausted = false;

  filterSource: 'all' | 'smt' | 'bom' = 'all';
  filterType: 'all' | 'input' | 'output' = 'all';

  async ngOnInit() {
    await this.loadPage(true);
  }

  async loadPage(isFirst = false) {
    if (isFirst) {
      this.loading = true;
      this.movements = [];
      this.lastSmtDoc = null;
      this.lastBomDoc = null;
      this.smtExhausted = false;
      this.bomExhausted = false;
    } else {
      this.loadingMore = true;
    }

    try {
      const half = Math.ceil(this.PAGE_SIZE / 2);

      // Cargar SMT
      let smtMovements: UnifiedMovement[] = [];
      if (!this.smtExhausted) {
        const result = this.lastSmtDoc
          ? await this.smtService.getMovementsPaginated(half, this.lastSmtDoc)
          : await this.smtService.getMovementsPaginated(half);

        smtMovements = result.movements.map(m => ({
          id: m.id,
          source: 'smt' as const,
          type: m.type === 'entrada' ? 'input' : 'output',
          partNumber: m.partNumber,
          quantity: m.quantity,
          userId: m.userId,
          userEmail: m.userEmail,
          date: m.date
        }));

        this.lastSmtDoc = result.lastDoc;
        if (result.movements.length < half) this.smtExhausted = true;
      }

      // Cargar BOM
      let bomMovements: UnifiedMovement[] = [];
      if (!this.bomExhausted) {
        const result = this.lastBomDoc
          ? await this.bomService.getMovementsPaginated(half, this.lastBomDoc)
          : await this.bomService.getMovementsPaginated(half);

        bomMovements = result.movements.map(m => ({
          id: m.id,
          source: 'bom' as const,
          type: m.type,
          bomName: m.bomName,
          quantity: m.quantity,
          userId: m.userId,
          userEmail: m.userEmail,
          date: m.date
        }));

        this.lastBomDoc = result.lastDoc;
        if (result.movements.length < half) this.bomExhausted = true;
      }

      // Mezclar y ordenar por fecha
      const merged = [...smtMovements, ...bomMovements].sort((a, b) => {
        const dateA = a.date?.toDate ? a.date.toDate() : new Date(a.date);
        const dateB = b.date?.toDate ? b.date.toDate() : new Date(b.date);
        return dateB.getTime() - dateA.getTime();
      });

      this.movements = [...this.movements, ...merged];
      this.hasMore = !this.smtExhausted || !this.bomExhausted;

    } catch (e: any) {
      this.error = e.message || 'Error al cargar historial';
    } finally {
      this.loading = false;
      this.loadingMore = false;
      this.cdr.detectChanges();
    }
  }

  async loadMore() {
    if (this.loadingMore || !this.hasMore) return;
    await this.loadPage(false);
  }

  get filteredMovements(): UnifiedMovement[] {
    return this.movements.filter(m => {
      const matchSource = this.filterSource === 'all' || m.source === this.filterSource;
      const matchType = this.filterType === 'all' || m.type === this.filterType;
      return matchSource && matchType;
    });
  }

  async setFilterSource(source: 'all' | 'smt' | 'bom') {
    this.filterSource = source;
  }

  async setFilterType(type: 'all' | 'input' | 'output') {
    this.filterType = type;
  }

  // Método para exportar el historial filtrado a Excel
  async exportHistory() {
    const data = this.filteredMovements.map(m => ({
      'Origen': m.source.toUpperCase(),
      'Tipo': m.type === 'input' ? 'Entrada' : 'Salida',
      'Detalle': m.source === 'smt' ? m.partNumber : m.bomName,
      'Cantidad': m.quantity,
      'Usuario': m.userEmail,
      'Fecha': m.date?.toDate ? m.date.toDate().toLocaleString('es-MX') : '—',
    }));

    this.exportService.exportToExcel(data, 'Historial', 'Movimientos');
  }
}
