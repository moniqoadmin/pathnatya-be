import { BadRequestException, Injectable } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import { cellToString, inferType } from './excel-cell.util';
import {
  DetectedColumn,
  ExcelAnalysis,
  SheetAnalysis,
  TaskColumnDataType,
} from './excel-merge.types';

const HEADER_SCAN_ROWS = 40;
const SAMPLE_ROWS = 25;

@Injectable()
export class ExcelAnalyzerService {
  async analyze(buffer: Buffer): Promise<ExcelAnalysis> {
    const workbook = new ExcelJS.Workbook();
    try {
      await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
    } catch {
      throw new BadRequestException('Could not read the uploaded Excel file');
    }

    if (workbook.worksheets.length === 0) {
      throw new BadRequestException('The uploaded Excel file has no sheets');
    }

    const sheets = workbook.worksheets.map((sheet) => this.analyzeSheet(sheet));
    const selected =
      sheets
        .filter((sheet) => sheet.isLikelyDataSheet)
        .sort(
          (a, b) =>
            b.columnCount + b.dataRowCount - (a.columnCount + a.dataRowCount),
        )[0] ??
      sheets.find((sheet) => sheet.headerRow !== null) ??
      null;

    return {
      sheets,
      selectedSheet: selected?.name ?? null,
      headerRow: selected?.headerRow ?? null,
      columns: selected?.columns ?? [],
    };
  }

  async loadWorkbook(buffer: Buffer): Promise<ExcelJS.Workbook> {
    const workbook = new ExcelJS.Workbook();
    try {
      await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
    } catch {
      throw new BadRequestException('Could not read the uploaded Excel file');
    }
    return workbook;
  }

  analyzeSheet(sheet: ExcelJS.Worksheet): SheetAnalysis {
    const headerRow = this.findHeaderRow(sheet);
    if (headerRow === null) {
      return {
        name: sheet.name,
        headerRow: null,
        columnCount: 0,
        dataRowCount: 0,
        emptyRowCount: 0,
        columns: [],
        isLikelyDataSheet: false,
      };
    }

    const columns = this.readColumns(sheet, headerRow);
    let dataRowCount = 0;
    let emptyRowCount = 0;
    for (
      let rowNumber = headerRow + 1;
      rowNumber <= sheet.rowCount;
      rowNumber++
    ) {
      if (this.isEmptyRow(sheet.getRow(rowNumber), columns.length)) {
        emptyRowCount += 1;
      } else {
        dataRowCount += 1;
      }
    }

    return {
      name: sheet.name,
      headerRow,
      columnCount: columns.length,
      dataRowCount,
      emptyRowCount,
      columns,
      isLikelyDataSheet: columns.length >= 2 && dataRowCount > 0,
    };
  }

  private findHeaderRow(sheet: ExcelJS.Worksheet): number | null {
    const scanLimit = Math.min(HEADER_SCAN_ROWS, Math.max(sheet.rowCount, 1));
    let best: { rowNumber: number; score: number } | null = null;

    for (let rowNumber = 1; rowNumber <= scanLimit; rowNumber++) {
      const score = this.scoreHeaderRow(sheet, rowNumber);
      if (score > 0 && (!best || score > best.score)) {
        best = { rowNumber, score };
      }
    }

    return best?.rowNumber ?? null;
  }

  private scoreHeaderRow(sheet: ExcelJS.Worksheet, rowNumber: number): number {
    const row = sheet.getRow(rowNumber);
    const values: string[] = [];
    row.eachCell({ includeEmpty: false }, (cell) => {
      const text = cellToString(cell.value);
      if (text) {
        values.push(text);
      }
    });
    if (values.length < 1) {
      return 0;
    }

    const unique = new Set(values.map((value) => value.toLowerCase()));
    const numeric = values.filter((value) =>
      /^-?\d+(?:\.\d+)?$/.test(value),
    ).length;
    if (numeric / values.length > 0.6) {
      return 0;
    }

    let following = 0;
    for (let offset = 1; offset <= 5; offset++) {
      const next = sheet.getRow(rowNumber + offset);
      let filled = 0;
      next.eachCell({ includeEmpty: false }, (cell) => {
        if (cellToString(cell.value)) {
          filled += 1;
        }
      });
      if (filled > 0) {
        following += 1;
      }
    }

    return unique.size * 3 + values.length + following * 2;
  }

  private readColumns(
    sheet: ExcelJS.Worksheet,
    headerRowNumber: number,
  ): DetectedColumn[] {
    const headerRow = sheet.getRow(headerRowNumber);
    const headers: Array<{ index: number; header: string }> = [];
    headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      const header = cellToString(cell.value);
      if (header) {
        headers.push({ index: colNumber, header });
      }
    });

    return headers.map(({ index, header }) => {
      const samples: unknown[] = [];
      const sampleStrings: string[] = [];
      let emptyCount = 0;
      let filledCount = 0;
      const last = Math.min(sheet.rowCount, headerRowNumber + SAMPLE_ROWS);
      for (
        let rowNumber = headerRowNumber + 1;
        rowNumber <= last;
        rowNumber++
      ) {
        const cell = sheet.getRow(rowNumber).getCell(index);
        const raw = cell.value;
        const text = cellToString(raw);
        if (!text) {
          emptyCount += 1;
          continue;
        }
        filledCount += 1;
        samples.push(raw instanceof Date ? raw : text);
        if (sampleStrings.length < 5) {
          sampleStrings.push(text);
        }
      }

      return {
        index,
        header,
        sampleValues: sampleStrings,
        inferredType: inferType(samples) as TaskColumnDataType,
        emptyCount,
        filledCount,
      };
    });
  }

  private isEmptyRow(row: ExcelJS.Row, columnCount: number): boolean {
    const scanTo = Math.max(columnCount, row.cellCount);
    for (let col = 1; col <= scanTo; col++) {
      if (cellToString(row.getCell(col).value)) {
        return false;
      }
    }
    return true;
  }
}
