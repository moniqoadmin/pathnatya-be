import { validateMappedRow } from './excel-row.validator';
import { TaskColumnDataType } from './excel-merge.types';
import { MergeTaskColumn } from './entities/task-column.entity';
import {
  inferType,
  normalizeHeader,
  toColumnKey,
  unexpectedHeaders,
} from './excel-cell.util';

function column(
  key: string,
  label: string,
  dataType: TaskColumnDataType,
  required = false,
): MergeTaskColumn {
  return {
    id: key,
    taskId: 'task',
    key,
    label,
    dataType,
    required,
    sortOrder: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe('excel-row.validator', () => {
  const columns = [
    column('kendra_name', 'Kendra Name', TaskColumnDataType.STRING, true),
    column('mobile_number', 'Mobile Number', TaskColumnDataType.PHONE, true),
    column('teams', 'Teams', TaskColumnDataType.INTEGER, true),
    column('notes', 'Notes', TaskColumnDataType.STRING, false),
  ];

  it('accepts a complete valid row', () => {
    const result = validateMappedRow(
      columns,
      {
        kendra_name: 'Baner',
        mobile_number: '9876543210',
        teams: '4',
        notes: '',
      },
      { Kendra: 'Baner', 'Mobile No': '9876543210', Teams: '4' },
    );
    expect(result.valid).toBe(true);
    expect(result.data).toEqual({
      kendra_name: 'Baner',
      mobile_number: '9876543210',
      teams: 4,
      notes: null,
    });
  });

  it('keeps original values when validation fails', () => {
    const original = { Mobile: 'ABC123', Teams: 'Four', Kendra: 'Baner' };
    const result = validateMappedRow(
      columns,
      {
        kendra_name: 'Baner',
        mobile_number: 'ABC123',
        teams: 'Four',
      },
      original,
    );
    expect(result.valid).toBe(false);
    expect(result.fieldErrors.map((error) => error.columnKey).sort()).toEqual([
      'mobile_number',
      'teams',
    ]);
    expect(
      result.fieldErrors.find((error) => error.columnKey === 'mobile_number')
        ?.originalValue,
    ).toBe('ABC123');
  });
});

describe('excel-cell.util', () => {
  it('normalizes headers so aliases collide', () => {
    expect(normalizeHeader('Mobile No.')).toBe(normalizeHeader('mobile no'));
    expect(normalizeHeader('No. of Teams')).toBe('no of teams');
  });

  it('builds unique column keys', () => {
    const used = new Set<string>();
    expect(toColumnKey('Kendra Name', used)).toBe('kendra_name');
    expect(toColumnKey('Kendra Name', used)).toBe('kendra_name_2');
  });

  it('infers phone and integer types from samples', () => {
    expect(inferType(['9876543210', '9123456789'])).toBe(
      TaskColumnDataType.PHONE,
    );
    expect(inferType(['4', '12', '0'])).toBe(TaskColumnDataType.INTEGER);
    expect(inferType(['Baner', 'Kothrud'])).toBe(TaskColumnDataType.STRING);
  });

  it('flags new column names against the frozen first-file headers', () => {
    const frozen = ['Taluka', 'Kendra Name', 'Mobile No', 'Teams'];
    expect(unexpectedHeaders(frozen, frozen)).toEqual([]);
    expect(
      unexpectedHeaders(frozen, [
        'kendra name',
        'Mobile No.',
        'Teams',
        'Taluka',
      ]),
    ).toEqual([]);
    expect(
      unexpectedHeaders(frozen, [
        'Taluka',
        'Kendra Name',
        'Mobile No',
        'Teams',
        'Spots',
        'Remarks',
      ]),
    ).toEqual(['Spots', 'Remarks']);
  });
});
