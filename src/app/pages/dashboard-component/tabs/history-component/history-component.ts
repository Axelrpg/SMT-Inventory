import { Component, inject, OnInit, ChangeDetectorRef } from '@angular/core';
import { DatePipe } from '@angular/common';
import { SmtService } from '../../../../core/services/smt.service';
import { BomService } from '../../../../core/services/bom.service';
import { UnifiedMovement } from '../../../../core/models/unified-movement.model';
import { QueryDocumentSnapshot } from '@angular/fire/firestore';
import { ExportService } from '../../../../core/services/export.service';
import { SubassemblyService } from '../../../../core/services/subassembly.service';
import { HilightService } from '../../../../core/services/hilight.service';
import { HLService } from '../../../../core/services/hl.service';

@Component({
  selector: 'app-history-component',
  imports: [DatePipe],
  templateUrl: './history-component.html',
  styleUrl: './history-component.css',
})
export class HistoryComponent implements OnInit {
  private smtService = inject(SmtService);
  private bomService = inject(BomService);
  private subassemblyService = inject(SubassemblyService);
  private hilightService = inject(HilightService)
  private hlService = inject(HLService)
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
  private lastSubDoc: QueryDocumentSnapshot | null = null;
  private lastHilDoc: QueryDocumentSnapshot | null = null;
  private lastHlDoc: QueryDocumentSnapshot | null = null;

  private smtExhausted = false;
  private bomExhausted = false;
  private subExhausted = false;
  private hilExhausted = false;
  private hlExhausted = false;

  filterSource: 'all' | 'smt' | 'bom' | 'subassembly' | 'hilight' | 'hl' = 'all';
  filterType: 'all' | 'entrada' | 'salida' = 'all';

  async ngOnInit() {
    await this.loadPage(true);
  }

  async loadPage(isFirst = false) {
    if (isFirst) {
      this.loading = true;
      this.movements = [];

      this.lastSmtDoc = null;
      this.lastBomDoc = null;
      this.lastSubDoc = null;
      this.lastHilDoc = null;
      this.lastHlDoc = null;

      this.smtExhausted = false;
      this.bomExhausted = false;
      this.subExhausted = false;
      this.hilExhausted = false;
      this.hlExhausted = false;
    } else {
      this.loadingMore = true;
    }

    try {
      const SECTIONS_PER_PAGE = 5;
      const PAGE_FRACTION_SIZE = Math.ceil(this.PAGE_SIZE / SECTIONS_PER_PAGE);

      // SMT
      let smtMovements: UnifiedMovement[] = [];
      if (!this.smtExhausted) {
        const result = await this.smtService.getMovementsPaginated(PAGE_FRACTION_SIZE, this.lastSmtDoc ?? undefined);
        smtMovements = result.movements.map(m => ({
          id: m.id,
          source: 'smt' as const,
          type: m.type === 'entrada' ? 'entrada' : 'salida',
          partNumber: m.partNumber,
          quantity: m.quantity,
          userId: m.userId,
          userName: m.userName,
          date: m.date
        }));
        this.lastSmtDoc = result.lastDoc;
        if (result.movements.length < PAGE_FRACTION_SIZE) this.smtExhausted = true;
      }

      // BOM
      let bomMovements: UnifiedMovement[] = [];
      if (!this.bomExhausted) {
        const result = await this.bomService.getMovementsPaginated(PAGE_FRACTION_SIZE, this.lastBomDoc ?? undefined);
        bomMovements = result.movements.map(m => ({
          id: m.id,
          source: 'bom' as const,
          type: m.type === 'entrada' ? 'entrada' : 'salida',
          bomName: m.bomName,
          quantity: m.quantity,
          userId: m.userId,
          userName: m.userName,
          date: m.date
        }));
        this.lastBomDoc = result.lastDoc;
        if (result.movements.length < PAGE_FRACTION_SIZE) this.bomExhausted = true;
      }

      // Subensambles
      let subMovements: UnifiedMovement[] = [];
      if (!this.subExhausted) {
        const result = await this.subassemblyService.getMovementsPaginated(PAGE_FRACTION_SIZE, this.lastSubDoc ?? undefined);
        subMovements = result.movements.map(m => ({
          id: m.id,
          source: 'subassembly' as const,
          type: m.type === 'entrada' ? 'entrada' : 'salida',
          magazine: m.magazine,
          partNumber: m.partNumber,
          quantity: m.quantity,
          userId: m.userId,
          userName: m.userName,
          date: m.date
        }));
        this.lastSubDoc = result.lastDoc;
        if (result.movements.length < PAGE_FRACTION_SIZE) this.subExhausted = true;
      }

      // Hilight
      let hilightMovements: UnifiedMovement[] = [];
      if (!this.hilExhausted) {
        const result = await this.hilightService.getMovementsPaginated(PAGE_FRACTION_SIZE, this.lastHilDoc ?? undefined);
        hilightMovements = result.movements.map(m => ({
          id: m.id,
          source: 'hilight' as const,
          type: m.type === 'input' ? 'entrada' : 'salida',
          partNumber: m.partNumber,
          quantity: m.length,
          userId: m.userId,
          userName: m.userName,
          date: m.date
        }));
        this.lastHilDoc = result.lastDoc;
        if (result.movements.length < PAGE_FRACTION_SIZE) this.hilExhausted = true;
      }

      // HL
      let hlMovements: UnifiedMovement[] = [];
      if (!this.hlExhausted) {
        const result = await this.hlService.getMovementsPaginated(PAGE_FRACTION_SIZE, this.lastHlDoc ?? undefined);
        hlMovements = result.movements.map(m => ({
          id: m.id,
          source: 'hl' as const,
          type: m.type === 'input' ? 'entrada' : 'salida',
          bomName: m.hlName,
          quantity: m.quantity,
          userId: m.userId,
          userName: m.userName,
          date: m.date
        }));
        this.lastHlDoc = result.lastDoc;
        if (result.movements.length < PAGE_FRACTION_SIZE) this.hlExhausted = true;
      }

      // Mezclar y ordenar
      const merged = [...smtMovements, ...bomMovements, ...subMovements, ...hilightMovements, ...hlMovements].sort((a, b) => {
        const dateA = a.date?.toDate ? a.date.toDate() : new Date(a.date);
        const dateB = b.date?.toDate ? b.date.toDate() : new Date(b.date);
        return dateB.getTime() - dateA.getTime();
      });

      this.movements = [...this.movements, ...merged];
      this.hasMore = !this.smtExhausted || !this.bomExhausted || !this.subExhausted || !this.hilExhausted;

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

  setFilterSource(source: 'all' | 'smt' | 'bom' | 'subassembly' | 'hilight' | 'hl') {
    this.filterSource = source;
  }

  setFilterType(type: 'all' | 'entrada' | 'salida') {
    this.filterType = type;
  }

  // ── Exportar ──────────────────────────────────────────
  exportHistory() {
    const data = this.filteredMovements.map(m => ({
      'Origen': this.sourceLabel(m.source),
      'Tipo': m.type === 'entrada' ? 'Entrada' : 'Salida',
      'Detalle': this.movementDetail(m),
      'Cantidad': m.quantity,
      'Usuario': m.userName,
      'Fecha': m.date?.toDate ? m.date.toDate().toLocaleString('es-MX') : '—',
    }));
    this.exportService.exportToExcel(data, 'Historial', 'Movimientos');
  }

  sourceLabel(source: string): string {
    const labels: any = { smt: 'SMT', bom: 'BOM', subassembly: 'Subensamble', hilight: 'Hilight', hl: 'HL' };
    return labels[source] || source;
  }

  movementDetail(m: UnifiedMovement): string {
    if (m.source === 'smt') return m.partNumber || '—';
    if (m.source === 'bom') return m.bomName || '—';
    if (m.source === 'subassembly') return `${m.magazine} — ${m.partNumber}`;
    if (m.source === 'hilight') return m.partNumber || '-';
    if (m.source === 'hl') return m.bomName || '-';
    return '—';
  }
}