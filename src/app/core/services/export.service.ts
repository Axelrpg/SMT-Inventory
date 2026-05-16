import { Injectable } from '@angular/core';
import * as XLSX from 'xlsx';

@Injectable({ providedIn: 'root' })
export class ExportService {

    exportToExcel(data: any[], fileName: string, sheetName: string = 'Datos') {
        const worksheet = XLSX.utils.json_to_sheet(data);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
        XLSX.writeFile(workbook, `${fileName}.xlsx`);
    }

    // Exportar múltiples hojas en un solo archivo
    exportMultiSheet(sheets: { name: string; data: any[] }[], fileName: string) {
        const workbook = XLSX.utils.book_new();
        sheets.forEach(sheet => {
            const worksheet = XLSX.utils.json_to_sheet(sheet.data);
            XLSX.utils.book_append_sheet(workbook, worksheet, sheet.name);
        });
        XLSX.writeFile(workbook, `${fileName}.xlsx`);
    }
}