import { PrimaryValueIndex, validateMappedRow } from './excel-row.validator';
import { TaskColumnDataType } from './excel-merge.types';
import { MergeTaskColumn } from './entities/task-column.entity';
import { inferType, normalizeHeader, toColumnKey } from './excel-cell.util';

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
    primary: false,
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

  it('leaves a new optional output column null when the row has no value', () => {
    const result = validateMappedRow(
      [...columns, column('age', 'Age', TaskColumnDataType.INTEGER, false)],
      {
        kendra_name: 'Baner',
        mobile_number: '9876543210',
        teams: '4',
      },
      { Kendra: 'Baner' },
    );
    expect(result.valid).toBe(true);
    expect(result.data.age).toBeNull();
  });

  it('requires a value in the primary column', () => {
    const result = validateMappedRow(
      [column('mobile_number', 'Mobile Number', TaskColumnDataType.PHONE)].map(
        (item, index) => (index === 0 ? { ...item, primary: true } : item),
      ),
      { mobile_number: '' },
      { Mobile: '' },
    );
    expect(result.valid).toBe(false);
    expect(result.fieldErrors[0].message).toBe(
      'Mobile Number is the primary column and is required',
    );
  });
});

describe('PrimaryValueIndex', () => {
  it('treats case variants as the same primary value', () => {
    const name = column('name', 'Name', TaskColumnDataType.STRING);
    name.primary = true;
    const index = new PrimaryValueIndex(['Rahul']);

    expect(index.check(name, 'rahul')?.message).toBe(
      'Name "rahul" is already in the merged data',
    );
    expect(index.check(name, 'Asha')).toBeNull();
    index.remember('Asha');
    expect(index.check(name, 'asha')?.message).toBe(
      'Name "asha" is duplicated in this file',
    );
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
});
