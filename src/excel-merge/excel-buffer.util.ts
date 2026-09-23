import { BadRequestException } from '@nestjs/common';

type JsonBuffer = { type: 'Buffer'; data: number[] };

export function toExcelBuffer(value: unknown): Buffer {
  if (value === null || value === undefined) {
    throw new BadRequestException(
      'Original Excel file is no longer available. Please re-upload the file.',
    );
  }
  if (Buffer.isBuffer(value)) {
    return Buffer.from(value);
  }
  if (value instanceof Uint8Array) {
    return Buffer.from(value);
  }
  if (value instanceof ArrayBuffer) {
    return Buffer.from(value);
  }
  if (typeof value === 'string') {
    const hex = value.startsWith('\\x') ? value.slice(2) : value;
    if (/^[0-9a-fA-F]+$/.test(hex) && hex.length % 2 === 0) {
      return Buffer.from(hex, 'hex');
    }
  }
  if (Array.isArray(value) && value.every((item) => typeof item === 'number')) {
    return Buffer.from(value);
  }
  if (isJsonBuffer(value)) {
    return Buffer.from(value.data);
  }
  throw new BadRequestException(
    'Original Excel file is no longer available. Please re-upload the file.',
  );
}

export function toExcelArrayBuffer(value: unknown): ArrayBuffer {
  const buffer = toExcelBuffer(value);
  const copy = new Uint8Array(buffer.byteLength);
  copy.set(buffer);
  return copy.buffer;
}

export function isXlsxZip(value: unknown): boolean {
  try {
    const buffer = toExcelBuffer(value);
    return buffer.length >= 4 && buffer.subarray(0, 2).toString() === 'PK';
  } catch {
    return false;
  }
}

function isJsonBuffer(value: unknown): value is JsonBuffer {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const record = value as JsonBuffer;
  return record.type === 'Buffer' && Array.isArray(record.data);
}
