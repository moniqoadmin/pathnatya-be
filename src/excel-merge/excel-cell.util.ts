import * as ExcelJS from 'exceljs';
import { TaskColumnDataType } from './excel-merge.types';

export function normalizeHeader(value: string): string {
  return value
    .normalize('NFKC')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/[._/\\]+/g, ' ')
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function unexpectedHeaders(
  frozenHeaders: string[],
  detectedHeaders: string[],
): string[] {
  const allowed = new Set(
    frozenHeaders.map(normalizeHeader).filter((header) => header.length > 0),
  );
  const seen = new Set<string>();
  const extra: string[] = [];
  for (const header of detectedHeaders) {
    const normalized = normalizeHeader(header);
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    if (!allowed.has(normalized)) {
      extra.push(header);
    }
  }
  return extra;
}

export function toColumnKey(label: string, used: Set<string>): string {
  let base = label
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
    .slice(0, 60);
  if (!base) {
    base = 'column';
  }
  let key = base;
  let n = 2;
  while (used.has(key)) {
    key = `${base}_${n}`;
    n += 1;
  }
  used.add(key);
  return key;
}

export function cellToString(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) {
    return '';
  }
  if (value instanceof Date) {
    return formatDate(value);
  }
  if (typeof value === 'object') {
    const obj = value as {
      text?: string;
      result?: unknown;
      formula?: unknown;
      sharedFormula?: unknown;
      richText?: Array<{ text?: string }>;
    };
    if (obj.formula !== undefined || obj.sharedFormula !== undefined) {
      if (obj.result !== undefined && obj.result !== null) {
        return cellToString(obj.result as ExcelJS.CellValue);
      }
      return '';
    }
    if (Array.isArray(obj.richText)) {
      return obj.richText
        .map((part) => part.text ?? '')
        .join('')
        .trim();
    }
    if (typeof obj.text === 'string') {
      return obj.text.trim();
    }
    if (obj.result !== undefined && obj.result !== null) {
      return cellToString(obj.result as ExcelJS.CellValue);
    }
    return '';
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (Number.isInteger(value)) {
      return String(value);
    }
    return String(value);
  }
  return String(value).trim();
}

export function formatDate(value: Date): string {
  if (Number.isNaN(value.getTime())) {
    return '';
  }
  const year = value.getUTCFullYear();
  const month = String(value.getUTCMonth() + 1).padStart(2, '0');
  const day = String(value.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function inferType(samples: unknown[]): TaskColumnDataType {
  const filled = samples.filter(
    (sample) =>
      sample !== null && sample !== undefined && String(sample) !== '',
  );
  if (filled.length === 0) {
    return TaskColumnDataType.STRING;
  }

  if (filled.every((sample) => sample instanceof Date)) {
    return TaskColumnDataType.DATE;
  }

  const asStrings = filled.map((sample) => String(sample).trim());
  if (asStrings.every(looksLikeBoolean)) {
    return TaskColumnDataType.BOOLEAN;
  }
  if (asStrings.every(looksLikePhone)) {
    return TaskColumnDataType.PHONE;
  }
  if (asStrings.every(looksLikeInteger)) {
    return TaskColumnDataType.INTEGER;
  }
  if (asStrings.every(looksLikeNumber)) {
    return TaskColumnDataType.NUMBER;
  }
  if (asStrings.every(looksLikeDate)) {
    return TaskColumnDataType.DATE;
  }
  return TaskColumnDataType.STRING;
}

function looksLikeBoolean(value: string): boolean {
  return ['true', 'false', 'yes', 'no', 'y', 'n', '1', '0'].includes(
    value.toLowerCase(),
  );
}

function looksLikeInteger(value: string): boolean {
  return /^-?\d+(?:\.0+)?$/.test(value);
}

function looksLikeNumber(value: string): boolean {
  if (value === '') return false;
  const parsed = Number(value.replace(/,/g, ''));
  return Number.isFinite(parsed);
}

function looksLikePhone(value: string): boolean {
  const digits = value.replace(/\D/g, '');
  return /^\d{8,10}$/.test(digits);
}

function looksLikeDate(value: string): boolean {
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) {
    return !Number.isNaN(Date.parse(value));
  }
  if (/^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}$/.test(value)) {
    return true;
  }
  return false;
}
