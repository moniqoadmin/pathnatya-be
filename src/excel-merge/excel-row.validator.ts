import {
  isSupportedPhoneNumber,
  normalizePhoneNumber,
} from '../accounts/validators/supported-phone-number.validator';
import { formatDate } from './excel-cell.util';
import { FieldError, TaskColumnDataType } from './excel-merge.types';
import { MergeTaskColumn } from './entities/task-column.entity';

export type RowValidationResult = {
  valid: boolean;
  data: Record<string, unknown>;
  fieldErrors: FieldError[];
};

export function validateMappedRow(
  columns: MergeTaskColumn[],
  mapped: Record<string, unknown>,
  originalData: Record<string, unknown>,
): RowValidationResult {
  const data: Record<string, unknown> = {};
  const fieldErrors: FieldError[] = [];

  for (const column of columns) {
    const raw = mapped[column.key];
    const originalValue =
      originalForColumn(column, originalData) ?? raw ?? null;

    try {
      const parsed = parseValue(column, raw);
      data[column.key] = parsed;
      if (column.primary && isEmpty(parsed)) {
        fieldErrors.push({
          columnKey: column.key,
          label: column.label,
          message: `${column.label} is the primary column and is required`,
          originalValue,
          currentValue: raw ?? null,
        });
      } else if (column.required && isEmpty(parsed)) {
        fieldErrors.push({
          columnKey: column.key,
          label: column.label,
          message: `${column.label} is required`,
          originalValue,
          currentValue: raw ?? null,
        });
      }
    } catch (error) {
      data[column.key] = isEmpty(raw) ? null : raw;
      fieldErrors.push({
        columnKey: column.key,
        label: column.label,
        message: error instanceof Error ? error.message : 'Invalid value',
        originalValue,
        currentValue: raw ?? null,
      });
    }
  }

  return {
    valid: fieldErrors.length === 0,
    data,
    fieldErrors,
  };
}

function originalForColumn(
  column: MergeTaskColumn,
  originalData: Record<string, unknown>,
): unknown {
  const direct = originalData[column.label];
  if (direct !== undefined) {
    return direct;
  }
  const match = Object.entries(originalData).find(
    ([header]) => header.toLowerCase() === column.label.toLowerCase(),
  );
  return match?.[1];
}

function isEmpty(value: unknown): boolean {
  return value === null || value === undefined || String(value).trim() === '';
}

/** Comparable identity for a primary-column value. Empty values have no key. */
export function primaryValueKey(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? `number:${value}` : null;
  }
  if (typeof value === 'boolean') {
    return `boolean:${value}`;
  }
  const text = String(value).trim();
  if (!text) {
    return null;
  }
  return `text:${text.toLowerCase()}`;
}

/**
 * Tracks primary values already merged and values accepted from the current file.
 * A value is remembered only after the caller accepts the row.
 */
export class PrimaryValueIndex {
  private readonly merged = new Set<string>();
  private readonly acceptedInFile = new Set<string>();

  constructor(existingValues: unknown[]) {
    for (const value of existingValues) {
      const key = primaryValueKey(value);
      if (key) {
        this.merged.add(key);
      }
    }
  }

  check(
    column: MergeTaskColumn,
    value: unknown,
    scope: 'file' | 'request' = 'file',
  ): FieldError | null {
    const key = primaryValueKey(value);
    if (!key) {
      return null;
    }
    if (this.merged.has(key)) {
      return primaryFieldError(
        column,
        value,
        `${column.label} "${displayPrimary(value)}" is already in the merged data`,
      );
    }
    if (this.acceptedInFile.has(key)) {
      const where = scope === 'request' ? 'this request' : 'this file';
      return primaryFieldError(
        column,
        value,
        `${column.label} "${displayPrimary(value)}" is duplicated in ${where}`,
      );
    }
    return null;
  }

  remember(value: unknown) {
    const key = primaryValueKey(value);
    if (key) {
      this.acceptedInFile.add(key);
    }
  }
}

function displayPrimary(value: unknown): string {
  if (typeof value === 'boolean') {
    return value ? 'yes' : 'no';
  }
  return String(value).trim();
}

function primaryFieldError(
  column: MergeTaskColumn,
  value: unknown,
  message: string,
): FieldError {
  return {
    columnKey: column.key,
    label: column.label,
    message,
    originalValue: value,
    currentValue: value,
  };
}

function parseValue(column: MergeTaskColumn, raw: unknown): unknown {
  if (isEmpty(raw)) {
    return null;
  }

  switch (column.dataType) {
    case TaskColumnDataType.STRING:
      return String(raw).trim();
    case TaskColumnDataType.INTEGER: {
      const text = String(raw).trim().replace(/,/g, '').replace(/\.0+$/, '');
      const parsed = Number(text);
      if (!Number.isInteger(parsed)) {
        throw new Error(`${column.label} must be a whole number`);
      }
      return parsed;
    }
    case TaskColumnDataType.NUMBER: {
      const parsed = Number(String(raw).trim().replace(/,/g, ''));
      if (!Number.isFinite(parsed)) {
        throw new Error(`${column.label} must be a number`);
      }
      return parsed;
    }
    case TaskColumnDataType.PHONE: {
      const normalized = normalizePhoneNumber(raw);
      if (!isSupportedPhoneNumber(normalized)) {
        throw new Error(
          `${column.label} must be an 8, 9 or 10-digit phone number`,
        );
      }
      return normalized;
    }
    case TaskColumnDataType.DATE:
      return parseDate(column.label, raw);
    case TaskColumnDataType.BOOLEAN: {
      const value = String(raw).trim().toLowerCase();
      if (['true', 'yes', '1', 'y'].includes(value)) {
        return true;
      }
      if (['false', 'no', '0', 'n'].includes(value)) {
        return false;
      }
      throw new Error(`${column.label} must be yes or no`);
    }
    default:
      return String(raw).trim();
  }
}

function parseDate(label: string, raw: unknown): string {
  if (raw instanceof Date) {
    const formatted = formatDate(raw);
    if (!formatted) {
      throw new Error(`${label} must be a valid date`);
    }
    return formatted;
  }
  const text = String(raw).trim();
  const iso = text.match(/^(\d{4}-\d{2}-\d{2})/);
  if (iso) {
    const date = new Date(`${iso[1]}T00:00:00Z`);
    if (Number.isNaN(date.getTime())) {
      throw new Error(`${label} must be a valid date`);
    }
    return iso[1];
  }
  const slash = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (slash) {
    const day = slash[1].padStart(2, '0');
    const month = slash[2].padStart(2, '0');
    let year = slash[3];
    if (year.length === 2) {
      year = `20${year}`;
    }
    return `${year}-${month}-${day}`;
  }
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`${label} must be a valid date`);
  }
  return formatDate(parsed);
}
