import * as ExcelJS from 'exceljs';
import { ExcelAnalyzerService } from './excel-analyzer.service';
import { toExcelArrayBuffer } from './excel-buffer.util';
import {
  ListMergeFilesQueryDto,
  ListSortOrder,
  ListTaskDataQueryDto,
  ListTaskErrorsQueryDto,
} from './dto/list-excel-merge-query.dto';
import { ExcelMergeService } from './excel-merge.service';
import { TaskColumnDataType } from './excel-merge.types';

const USER = 'user-1';

type MemoryRow = Record<string, any>;
type SortDirection = 'ASC' | 'DESC';

function createMemoryRepository(files?: { rows: MemoryRow[] }) {
  const rows: MemoryRow[] = [];
  let sequence = 0;
  let clock = 1_700_000_000_000;

  function timestamp() {
    clock += 1;
    return new Date(clock);
  }

  function matches(row: MemoryRow, where: MemoryRow) {
    return Object.entries(where).every(([key, value]) => row[key] === value);
  }

  function compare(left: unknown, right: unknown) {
    if (left === right) {
      return 0;
    }
    if (left instanceof Date && right instanceof Date) {
      return left.getTime() - right.getTime();
    }
    if (typeof left === 'number' && typeof right === 'number') {
      return left - right;
    }
    return String(left ?? '').localeCompare(String(right ?? ''));
  }

function compareNullable(
  left: unknown,
  right: unknown,
  direction: SortDirection,
) {
  const leftMissing = left === null || left === undefined;
  const rightMissing = right === null || right === undefined;
  if (leftMissing && rightMissing) {
    return 0;
  }
  if (leftMissing) {
    return 1;
  }
  if (rightMissing) {
    return -1;
  }
  const diff = compare(left, right);
  return direction === 'DESC' ? -diff : diff;
}

function valueAt(row: MemoryRow, expression: string) {
  const json = expression.match(/row\.(\w+) ->> '([^']+)'/);
  if (json) {
    const raw = row[json[1]]?.[json[2]];
    if (raw === '' || raw === null || raw === undefined) {
      return null;
    }
    if (expression.includes('::numeric')) {
      const text = String(raw).trim();
      if (!/^-?[0-9]+(\.[0-9]+)?$/.test(text)) {
        return null;
      }
      return Number(text);
    }
    return raw;
  }
  if (expression === 'file.fileName') {
    return row.file?.fileName ?? null;
  }
  const field = expression.match(/^row\.(\w+)$/);
  return field ? row[field[1]] : null;
}

  function sortRows(source: MemoryRow[], order: Record<string, SortDirection>) {
    return [...source].sort((left, right) => {
      for (const [key, direction] of Object.entries(order)) {
        const diff = compare(left[key], right[key]);
        if (diff !== 0) {
          return direction === 'DESC' ? -diff : diff;
        }
      }
      return 0;
    });
  }

  function attachFile(row: MemoryRow) {
    if (!files) {
      return row;
    }
    row.file = files.rows.find((file) => file.id === row.fileId) ?? null;
    return row;
  }

  return {
    rows,
    create(value: MemoryRow) {
      return { ...value };
    },
    async save(value: MemoryRow | MemoryRow[]) {
      const list = Array.isArray(value) ? value : [value];
      const saved = list.map((item) => {
        if (!item.id) {
          sequence += 1;
          item.id = `id-${sequence}`;
        }
        if (!item.createdAt) {
          item.createdAt = timestamp();
        }
        item.updatedAt = timestamp();
        const index = rows.findIndex((row) => row.id === item.id);
        if (index >= 0) {
          rows[index] = item;
        } else {
          rows.push(item);
        }
        return item;
      });
      return Array.isArray(value) ? saved : saved[0];
    },
    async findOne(options: {
      where: MemoryRow;
      relations?: { file?: boolean };
    }) {
      const row = rows.find((item) => matches(item, options.where));
      if (!row) {
        return null;
      }
      return options.relations?.file ? attachFile(row) : row;
    },
    async find(
      options: {
        where?: MemoryRow;
        order?: Record<string, SortDirection>;
        relations?: { file?: boolean };
      } = {},
    ) {
      let result = rows.filter((row) => matches(row, options.where ?? {}));
      if (options.order) {
        result = sortRows(result, options.order);
      }
      if (options.relations?.file) {
        result.forEach((row) => attachFile(row));
      }
      return result;
    },
    async findAndCount(
      options: {
        where?: MemoryRow;
        order?: Record<string, SortDirection>;
        skip?: number;
        take?: number;
        relations?: { file?: boolean };
      } = {},
    ) {
      const all = await this.find(options);
      const skip = options.skip ?? 0;
      const take = options.take ?? all.length;
      return [all.slice(skip, skip + take), all.length] as const;
    },
    async count(options: { where?: MemoryRow } = {}) {
      return rows.filter((row) => matches(row, options.where ?? {})).length;
    },
    async delete(where: MemoryRow) {
      const kept = rows.filter((row) => !matches(row, where));
      const affected = rows.length - kept.length;
      rows.splice(0, rows.length, ...kept);
      return { affected };
    },
    async update(criteria: string | MemoryRow, partial: MemoryRow) {
      const selected =
        typeof criteria === 'string'
          ? rows.filter((row) => row.id === criteria)
          : rows.filter((row) => matches(row, criteria));
      for (const row of selected) {
        Object.assign(row, partial);
      }
    },
    async increment(where: MemoryRow, field: string, by = 1) {
      const row = rows.find((item) => matches(item, where));
      if (row) {
        row[field] = Number(row[field] ?? 0) + by;
      }
    },
    async decrement(where: MemoryRow, field: string, by = 1) {
      const row = rows.find((item) => matches(item, where));
      if (row) {
        row[field] = Number(row[field] ?? 0) - by;
      }
    },
    createQueryBuilder() {
      const params: MemoryRow = {};
      let skip = 0;
      let take = Number.POSITIVE_INFINITY;
      const orders: Array<{ expression: string; direction: SortDirection }> =
        [];
      const selects: Record<string, string> = {};
      const builder = {
        leftJoinAndSelect() {
          return builder;
        },
        where(_clause: string, next: MemoryRow) {
          Object.assign(params, next);
          return builder;
        },
        andWhere(_clause: string, next: MemoryRow) {
          Object.assign(params, next);
          return builder;
        },
        addSelect(selection?: string, alias?: string) {
          if (selection && alias) {
            selects[alias] = selection;
          }
          return builder;
        },
        orderBy(expression: string, direction: SortDirection = 'ASC') {
          orders.splice(0, orders.length, { expression, direction });
          return builder;
        },
        addOrderBy(expression: string, direction: SortDirection = 'ASC') {
          orders.push({ expression, direction });
          return builder;
        },
        skip(value: number) {
          skip = value;
          return builder;
        },
        take(value: number) {
          take = value;
          return builder;
        },
        async getOne() {
          return (
            rows.find(
              (row) => row.id === params.fileId && row.taskId === params.taskId,
            ) ?? null
          );
        },
        async getMany() {
          const [result] = await this.getManyAndCount();
          return result;
        },
        async getManyAndCount() {
          let result = rows.filter((row) => {
            if (params.taskId !== undefined && row.taskId !== params.taskId) {
              return false;
            }
            if (params.fileId !== undefined && row.fileId !== params.fileId) {
              return false;
            }
            if (params.status !== undefined && row.status !== params.status) {
              return false;
            }
            return true;
          });
          result.forEach((row) => attachFile(row));
          if (orders.length > 0) {
            result = [...result].sort((left, right) => {
              for (const order of orders) {
                const expression =
                  selects[order.expression] ?? order.expression;
                const diff = compareNullable(
                  valueAt(left, expression),
                  valueAt(right, expression),
                  order.direction,
                );
                if (diff !== 0) {
                  return diff;
                }
              }
              return 0;
            });
          }
          return [result.slice(skip, skip + take), result.length] as const;
        },
      };
      return builder;
    },
  };
}

function createService() {
  const tasks = createMemoryRepository();
  const columns = createMemoryRepository();
  const files = createMemoryRepository();
  const data = createMemoryRepository(files);
  const errors = createMemoryRepository(files);
  const service = new ExcelMergeService(
    tasks as never,
    columns as never,
    files as never,
    data as never,
    errors as never,
    new ExcelAnalyzerService(),
  );
  return { service, tasks, columns, data };
}

async function workbook(
  name: string,
  rows: Array<Array<string | number>>,
): Promise<Express.Multer.File> {
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet('Sheet1');
  for (const row of rows) {
    sheet.addRow(row);
  }
  return {
    originalname: name,
    buffer: Buffer.from(await book.xlsx.writeBuffer()),
  } as Express.Multer.File;
}

async function readExport(buffer: Buffer, sheetName = 'Kendra') {
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(toExcelArrayBuffer(buffer));
  const sheet = book.getWorksheet(sheetName);
  if (!sheet) {
    throw new Error(`${sheetName} sheet was not exported`);
  }
  const width = sheet.getRow(1).cellCount;
  const rows: unknown[][] = [];
  for (let rowNumber = 1; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const values: unknown[] = [];
    for (let col = 1; col <= width; col += 1) {
      values.push(sheet.getRow(rowNumber).getCell(col).value);
    }
    rows.push(values);
  }
  return rows;
}

async function establishOutputFormat(service: ExcelMergeService) {
  const task = await service.createTask(USER, { name: 'Club data' });
  const uploaded = await service.uploadFiles(task.id, USER, [
    await workbook('ward-a.xlsx', [
      ['Name', 'Mobile', 'City'],
      ['Rahul', '9999999999', 'Pune'],
    ]),
  ]);
  await service.confirmMapping(task.id, uploaded.files[0].id, {
    mappings: [
      {
        sourceHeader: 'Name',
        action: 'create',
        dataType: TaskColumnDataType.STRING,
      },
      {
        sourceHeader: 'Mobile',
        action: 'create',
        dataType: TaskColumnDataType.PHONE,
      },
      {
        sourceHeader: 'City',
        action: 'create',
        dataType: TaskColumnDataType.STRING,
      },
    ],
  });
  return service.getTask(task.id);
}

describe('ExcelMergeService output format', () => {
  it('lets the first processed file establish the output format', async () => {
    const { service } = createService();
    const task = await service.createTask(USER, { name: 'Club data' });

    expect(task.columns).toEqual([]);
    expect(task).not.toHaveProperty('schemaFrozen');
    expect(task).not.toHaveProperty('frozenHeaders');

    const uploaded = await service.uploadFiles(task.id, USER, [
      await workbook('ward-a.xlsx', [
        ['Name', 'Mobile', 'City'],
        ['Rahul', '9999999999', 'Pune'],
      ]),
    ]);
    const file = uploaded.files[0];
    expect(file.status).toBe('analyzed');
    expect(file.suggestedMappings.map((item) => item.action)).toEqual([
      'unmapped',
      'unmapped',
      'unmapped',
    ]);

    const processed = await service.confirmMapping(task.id, file.id, {
      mappings: [
        {
          sourceHeader: 'Name',
          action: 'create',
          dataType: TaskColumnDataType.STRING,
        },
        {
          sourceHeader: 'Mobile',
          action: 'create',
          dataType: TaskColumnDataType.PHONE,
        },
        {
          sourceHeader: 'City',
          action: 'create',
          dataType: TaskColumnDataType.STRING,
        },
      ],
    });

    expect(processed.status).toBe('processed');
    const detail = await service.getTask(task.id);
    expect(detail.columns.map((column) => column.label)).toEqual([
      'Name',
      'Mobile',
      'City',
    ]);
    expect(detail).not.toHaveProperty('schemaFrozen');
    expect(detail).not.toHaveProperty('frozenHeaders');

    const listed = await service.listData(task.id, new ListTaskDataQueryDto());
    expect(listed.data).toHaveLength(1);
    expect(listed.data[0].values).toEqual({
      name: 'Rahul',
      mobile: '9999999999',
      city: 'Pune',
    });
  });

  it('maps differently named columns and reuses that saved mapping', async () => {
    const { service } = createService();
    const task = await establishOutputFormat(service);
    const uploaded = await service.uploadFiles(task.id, USER, [
      await workbook('ward-b.xlsx', [
        ['Full Name', 'Phone', 'Town'],
        ['Priya', '9888888888', 'Mumbai'],
      ]),
    ]);
    const file = uploaded.files[0];
    expect(file.suggestedMappings.map((item) => item.reason)).toEqual([
      'unmapped',
      'unmapped',
      'unmapped',
    ]);

    const byLabel = new Map(
      task.columns.map((column) => [column.label, column.key]),
    );
    await service.confirmMapping(task.id, file.id, {
      mappings: [
        {
          sourceHeader: 'Full Name',
          action: 'map',
          columnKey: byLabel.get('Name'),
        },
        {
          sourceHeader: 'Phone',
          action: 'map',
          columnKey: byLabel.get('Mobile'),
        },
        {
          sourceHeader: 'Town',
          action: 'map',
          columnKey: byLabel.get('City'),
        },
      ],
    });

    const listed = await service.listData(task.id, new ListTaskDataQueryDto());
    expect(listed.data.map((row) => row.values)).toEqual([
      { name: 'Rahul', mobile: '9999999999', city: 'Pune' },
      { name: 'Priya', mobile: '9888888888', city: 'Mumbai' },
    ]);

    const again = await service.uploadFiles(task.id, USER, [
      await workbook('ward-c.xlsx', [
        ['Full Name', 'Phone', 'Town'],
        ['Asha', '9777777777', 'Delhi'],
      ]),
    ]);
    expect(
      again.files[0].suggestedMappings.map((item) => ({
        sourceHeader: item.sourceHeader,
        action: item.action,
        columnKey: item.columnKey,
        reason: item.reason,
      })),
    ).toEqual([
      {
        sourceHeader: 'Full Name',
        action: 'map',
        columnKey: 'name',
        reason: 'saved',
      },
      {
        sourceHeader: 'Phone',
        action: 'map',
        columnKey: 'mobile',
        reason: 'saved',
      },
      {
        sourceHeader: 'Town',
        action: 'map',
        columnKey: 'city',
        reason: 'saved',
      },
    ]);
  });

  it('suggests a unique label match and leaves ambiguous names unmapped', async () => {
    const { service, columns } = createService();
    const task = await service.createTask(USER, { name: 'Club data' });
    await service.addColumns(task.id, [
      { label: 'Name', dataType: TaskColumnDataType.STRING },
      { label: 'City', dataType: TaskColumnDataType.STRING },
    ]);

    const matched = await service.uploadFiles(task.id, USER, [
      await workbook('known.xlsx', [
        ['Name', 'City'],
        ['Rahul', 'Pune'],
      ]),
    ]);
    expect(
      matched.files[0].suggestedMappings.map((item) => item.reason),
    ).toEqual(['name_match', 'name_match']);

    columns.rows.push({
      id: 'legacy-name',
      taskId: task.id,
      key: 'name_legacy',
      label: 'Name',
      dataType: TaskColumnDataType.STRING,
      required: false,
      sortOrder: 5,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const ambiguous = await service.uploadFiles(task.id, USER, [
      await workbook('ambiguous.xlsx', [
        ['Name', 'City'],
        ['Asha', 'Delhi'],
      ]),
    ]);
    const nameSuggestion = ambiguous.files[0].suggestedMappings.find(
      (item) => item.sourceHeader === 'Name',
    );
    expect(nameSuggestion).toMatchObject({
      action: 'unmapped',
      columnKey: null,
      reason: 'unmapped',
    });
  });

  it('adds a column from a later file and keeps older rows blank', async () => {
    const { service, tasks } = createService();
    const task = await establishOutputFormat(service);
    const stored = tasks.rows.find((row) => row.id === task.id);
    stored!.frozenHeaders = ['Name', 'Mobile', 'City'];

    const byLabel = new Map(
      task.columns.map((column) => [column.label, column.key]),
    );
    const uploaded = await service.uploadFiles(task.id, USER, [
      await workbook('with-age.xlsx', [
        ['Name', 'Mobile', 'City', 'Age'],
        ['Asha', '9777777777', 'Delhi', 30],
      ]),
    ]);
    expect(uploaded.files[0].status).toBe('analyzed');
    expect(
      uploaded.files[0].suggestedMappings.find(
        (item) => item.sourceHeader === 'Age',
      ),
    ).toMatchObject({ action: 'unmapped', reason: 'unmapped' });

    await service.confirmMapping(task.id, uploaded.files[0].id, {
      mappings: [
        { sourceHeader: 'Name', action: 'map', columnKey: byLabel.get('Name') },
        {
          sourceHeader: 'Mobile',
          action: 'map',
          columnKey: byLabel.get('Mobile'),
        },
        { sourceHeader: 'City', action: 'map', columnKey: byLabel.get('City') },
        {
          sourceHeader: 'Age',
          action: 'create',
          label: 'Age',
          dataType: TaskColumnDataType.INTEGER,
        },
      ],
    });

    await service.addColumns(task.id, [
      { label: 'Notes', dataType: TaskColumnDataType.STRING },
    ]);

    const listed = await service.listData(task.id, new ListTaskDataQueryDto());
    expect(listed.columns.map((column) => column.label)).toEqual([
      'Name',
      'Mobile',
      'City',
      'Age',
      'Notes',
    ]);
    expect(listed.data.map((row) => row.values)).toEqual([
      {
        name: 'Rahul',
        mobile: '9999999999',
        city: 'Pune',
        age: null,
        notes: null,
      },
      {
        name: 'Asha',
        mobile: '9777777777',
        city: 'Delhi',
        age: 30,
        notes: null,
      },
    ]);

    const exported = await service.exportMaster(task.id);
    expect(await readExport(exported.buffer)).toEqual([
      ['SN', 'Name', 'Mobile', 'City', 'Age', 'Notes'],
      [1, 'Rahul', '9999999999', 'Pune', null, null],
      [2, 'Asha', '9777777777', 'Delhi', 30, null],
    ]);
    const detail = await service.getTask(task.id);
    expect(detail).not.toHaveProperty('schemaFrozen');
    expect(detail).not.toHaveProperty('frozenHeaders');
  });

  it('excludes ignored source columns from the output format', async () => {
    const { service } = createService();
    const task = await service.createTask(USER, { name: 'Club data' });
    const uploaded = await service.uploadFiles(task.id, USER, [
      await workbook('notes.xlsx', [
        ['Name', 'Mobile', 'Notes'],
        ['Rahul', '9999999999', 'internal'],
      ]),
    ]);
    await service.confirmMapping(task.id, uploaded.files[0].id, {
      mappings: [
        {
          sourceHeader: 'Name',
          action: 'create',
          dataType: TaskColumnDataType.STRING,
        },
        {
          sourceHeader: 'Mobile',
          action: 'create',
          dataType: TaskColumnDataType.PHONE,
        },
        { sourceHeader: 'Notes', action: 'ignore' },
      ],
    });

    const detail = await service.getTask(task.id);
    expect(detail.columns.map((column) => column.label)).toEqual([
      'Name',
      'Mobile',
    ]);
    const listed = await service.listData(task.id, new ListTaskDataQueryDto());
    expect(listed.data[0].values).toEqual({
      name: 'Rahul',
      mobile: '9999999999',
    });
    const exported = await service.exportMaster(task.id);
    expect(await readExport(exported.buffer)).toEqual([
      ['SN', 'Name', 'Mobile'],
      [1, 'Rahul', '9999999999'],
    ]);
  });

  it('rejects duplicate output column names without saving them', async () => {
    const { service } = createService();
    const task = await establishOutputFormat(service);

    await expect(
      service.addColumns(task.id, [{ label: 'name' }]),
    ).rejects.toThrow('An output column named "Name" already exists');
    await expect(
      service.addColumns(task.id, [{ label: 'Age' }, { label: 'Age.' }]),
    ).rejects.toThrow('An output column named "Age" already exists');

    const uploaded = await service.uploadFiles(task.id, USER, [
      await workbook('alias.xlsx', [
        ['Name', 'Alias'],
        ['Rahul', 'R'],
      ]),
    ]);
    await expect(
      service.confirmMapping(task.id, uploaded.files[0].id, {
        mappings: [
          { sourceHeader: 'Name', action: 'map', columnKey: 'name' },
          { sourceHeader: 'Alias', action: 'create', label: 'Name' },
        ],
      }),
    ).rejects.toThrow('An output column named "Name" already exists');
    await expect(
      service.confirmMapping(task.id, uploaded.files[0].id, {
        mappings: [
          { sourceHeader: 'Name', action: 'map', columnKey: 'name' },
          { sourceHeader: 'Alias', action: 'map', columnKey: 'name' },
        ],
      }),
    ).rejects.toThrow(
      'Two uploaded columns cannot map to the same output column',
    );

    const detail = await service.getTask(task.id);
    expect(detail.columns.map((column) => column.label)).toEqual([
      'Name',
      'Mobile',
      'City',
    ]);
  });

  it('keeps invalid rows in the error list until a correction is approved', async () => {
    const { service } = createService();
    const task = await service.createTask(USER, { name: 'Club data' });
    const uploaded = await service.uploadFiles(task.id, USER, [
      await workbook('mixed.xlsx', [
        ['Name', 'Mobile', 'City'],
        ['Rahul', '9999999999', 'Pune'],
        ['Asha', 'nope', 'Delhi'],
      ]),
    ]);
    await service.confirmMapping(task.id, uploaded.files[0].id, {
      mappings: [
        {
          sourceHeader: 'Name',
          action: 'create',
          dataType: TaskColumnDataType.STRING,
        },
        {
          sourceHeader: 'Mobile',
          action: 'create',
          dataType: TaskColumnDataType.PHONE,
        },
        {
          sourceHeader: 'City',
          action: 'create',
          dataType: TaskColumnDataType.STRING,
        },
      ],
    });

    const before = await service.exportMaster(task.id);
    expect(await readExport(before.buffer)).toEqual([
      ['SN', 'Name', 'Mobile', 'City'],
      [1, 'Rahul', '9999999999', 'Pune'],
    ]);

    const pending = await service.listErrors(
      task.id,
      new ListTaskErrorsQueryDto(),
    );
    expect(pending.data).toHaveLength(1);
    expect(
      pending.data[0].fields.find((field) => field.columnKey === 'mobile'),
    ).toMatchObject({ valid: false });

    const corrected = await service.updateError(task.id, pending.data[0].id, {
      values: { mobile: '9777777777' },
      approve: true,
    });
    expect(corrected.approved).toBe(true);

    const listed = await service.listData(task.id, new ListTaskDataQueryDto());
    expect(listed.data.map((row) => row.values.name)).toEqual([
      'Rahul',
      'Asha',
    ]);
    expect(listed.data[1].values.mobile).toBe('9777777777');
    expect(
      (await service.listErrors(task.id, new ListTaskErrorsQueryDto())).data,
    ).toEqual([]);

    const after = await service.exportMaster(task.id);
    expect(await readExport(after.buffer)).toEqual([
      ['SN', 'Name', 'Mobile', 'City'],
      [1, 'Rahul', '9999999999', 'Pune'],
      [2, 'Asha', '9777777777', 'Delhi'],
    ]);

    await expect(
      service.deleteError(task.id, pending.data[0].id),
    ).rejects.toThrow('Only pending error rows can be deleted');
  });

  it('deletes pending error rows without touching valid data', async () => {
    const { service } = createService();
    const task = await service.createTask(USER, { name: 'Club data' });
    const uploaded = await service.uploadFiles(task.id, USER, [
      await workbook('mixed.xlsx', [
        ['Name', 'Mobile', 'City'],
        ['Rahul', '9999999999', 'Pune'],
        ['Asha', 'nope', 'Delhi'],
        ['Kiran', 'also-bad', 'Nashik'],
      ]),
    ]);
    await service.confirmMapping(task.id, uploaded.files[0].id, {
      mappings: [
        {
          sourceHeader: 'Name',
          action: 'create',
          dataType: TaskColumnDataType.STRING,
        },
        {
          sourceHeader: 'Mobile',
          action: 'create',
          dataType: TaskColumnDataType.PHONE,
        },
        {
          sourceHeader: 'City',
          action: 'create',
          dataType: TaskColumnDataType.STRING,
        },
      ],
    });

    const pending = await service.listErrors(
      task.id,
      new ListTaskErrorsQueryDto(),
    );
    expect(pending.data.map((row) => row.originalValues.Name)).toEqual([
      'Asha',
      'Kiran',
    ]);

    const removed = await service.deleteError(task.id, pending.data[0].id);
    expect(removed).toEqual({ deleted: true });

    const remaining = await service.listErrors(
      task.id,
      new ListTaskErrorsQueryDto(),
    );
    expect(remaining.data.map((row) => row.originalValues.Name)).toEqual([
      'Kiran',
    ]);
    expect(
      (await service.listData(task.id, new ListTaskDataQueryDto())).data.map(
        (row) => row.values.name,
      ),
    ).toEqual(['Rahul']);

    const file = await service.getFile(task.id, uploaded.files[0].id);
    expect(file).toMatchObject({
      totalRows: 3,
      validCount: 1,
      errorCount: 1,
    });
    expect((await service.getTask(task.id)).pendingErrorCount).toBe(1);

    const dropped = await service.deleteErrors(task.id, [
      pending.data[1].id,
      pending.data[1].id,
    ]);
    expect(dropped).toEqual({ deleted: true, count: 1 });
    expect(
      (await service.listErrors(task.id, new ListTaskErrorsQueryDto())).data,
    ).toEqual([]);
    expect(
      (await service.getFile(task.id, uploaded.files[0].id)).errorCount,
    ).toBe(0);

    const exported = await service.exportMaster(task.id);
    expect(await readExport(exported.buffer)).toEqual([
      ['SN', 'Name', 'Mobile', 'City'],
      [1, 'Rahul', '9999999999', 'Pune'],
    ]);
    const errorExport = await service.exportErrors(task.id);
    expect(await readExport(errorExport.buffer, 'Errors')).toEqual([
      ['File', 'Original Row', 'Name', 'Mobile', 'City', 'Problems'],
    ]);

    await expect(service.deleteError(task.id, pending.data[0].id)).rejects.toThrow(
      'Error row not found',
    );
  });

  it('checks later files for primary-column duplicates and other column rules', async () => {
    const { service } = createService();
    const task = await establishOutputFormat(service);
    const keys = new Map(
      task.columns.map((column) => [column.label, column.key]),
    );
    const mobileId = task.columns.find(
      (column) => column.label === 'Mobile',
    )?.id;
    const cityId = task.columns.find((column) => column.label === 'City')?.id;
    if (!mobileId || !cityId) {
      throw new Error('expected Name, Mobile, and City columns');
    }

    const repeated = await service.uploadFiles(task.id, USER, [
      await workbook('repeat.xlsx', [
        ['Name', 'Mobile', 'City'],
        ['Kiran', '9999999999', 'Nashik'],
      ]),
    ]);
    await service.confirmMapping(task.id, repeated.files[0].id, {
      mappings: [
        { sourceHeader: 'Name', action: 'map', columnKey: keys.get('Name') },
        {
          sourceHeader: 'Mobile',
          action: 'map',
          columnKey: keys.get('Mobile'),
        },
        { sourceHeader: 'City', action: 'map', columnKey: keys.get('City') },
      ],
    });
    expect(
      (await service.listData(task.id, new ListTaskDataQueryDto())).data,
    ).toHaveLength(2);

    const marked = await service.updateColumn(task.id, mobileId, {
      primary: true,
    });
    expect(marked).toMatchObject({ label: 'Mobile', primary: true });
    await service.updateColumn(task.id, cityId, { primary: true });
    await service.updateColumn(task.id, mobileId, { primary: true });
    const columns = (await service.getTask(task.id)).columns;
    expect(columns.find((column) => column.label === 'Mobile')?.primary).toBe(
      true,
    );
    expect(columns.find((column) => column.label === 'City')?.primary).toBe(
      false,
    );

    const uploaded = await service.uploadFiles(task.id, USER, [
      await workbook('next.xlsx', [
        ['Name', 'Mobile', 'City'],
        ['Amit', '9888888888', 'Pune'],
        ['Amit', '9888888888', 'Mumbai'],
        ['Other', '9999999999', 'Delhi'],
        ['Blank', '', 'Pune'],
        ['Bad', 'nope', 'Pune'],
        ['Neha', '9666666666', 'Delhi'],
      ]),
    ]);
    await service.confirmMapping(task.id, uploaded.files[0].id, {
      mappings: [
        { sourceHeader: 'Name', action: 'map', columnKey: keys.get('Name') },
        {
          sourceHeader: 'Mobile',
          action: 'map',
          columnKey: keys.get('Mobile'),
        },
        { sourceHeader: 'City', action: 'map', columnKey: keys.get('City') },
      ],
    });

    const listed = await service.listData(task.id, new ListTaskDataQueryDto());
    expect(listed.data.map((row) => row.values.name)).toEqual([
      'Rahul',
      'Kiran',
      'Amit',
      'Neha',
    ]);

    const pending = await service.listErrors(
      task.id,
      new ListTaskErrorsQueryDto(),
    );
    const problem = (name: string) =>
      pending.data.find((row) => row.originalValues.Name === name);
    expect(
      problem('Amit')?.fields.find((field) => field.columnKey === 'mobile')
        ?.message,
    ).toBe('Mobile "9888888888" is duplicated in this file');
    expect(
      problem('Other')?.fields.find((field) => field.columnKey === 'mobile')
        ?.message,
    ).toBe('Mobile "9999999999" is already in the merged data');
    expect(
      problem('Blank')?.fields.find((field) => field.columnKey === 'mobile')
        ?.message,
    ).toBe('Mobile is the primary column and is required');
    expect(
      problem('Bad')?.fields.find((field) => field.columnKey === 'mobile')
        ?.message,
    ).toContain('phone number');

    const duplicate = problem('Other');
    if (!duplicate) {
      throw new Error('expected a duplicate row');
    }
    const blocked = await service.updateError(task.id, duplicate.id, {
      values: { mobile: '9999999999' },
      approve: true,
    });
    expect(blocked.approved).toBe(false);
    expect(blocked.remainingProblems.map((error) => error.message)).toContain(
      'Mobile "9999999999" is already in the merged data',
    );

    const fileDuplicate = problem('Amit');
    if (!fileDuplicate) {
      throw new Error('expected a file duplicate');
    }
    const approved = await service.updateError(task.id, fileDuplicate.id, {
      values: { mobile: '9555555555' },
      approve: true,
    });
    expect(approved.approved).toBe(true);

    await expect(
      service.addColumns(task.id, [
        { label: 'Age', primary: true },
        { label: 'Notes', primary: true },
      ]),
    ).rejects.toThrow('A task can have only one primary column');
    await service.addColumns(task.id, [{ label: 'Code', primary: true }]);
    const latest = await service.getTask(task.id);
    expect(
      latest.columns
        .filter((column) => column.primary)
        .map((column) => column.label),
    ).toEqual(['Code']);
  });
});

describe('ExcelMergeService merged data CRUD', () => {
  async function setup() {
    const { service } = createService();
    const task = await establishOutputFormat(service);
    const files = await service.listFiles(
      task.id,
      new ListMergeFilesQueryDto(),
    );
    const listed = await service.listData(task.id, new ListTaskDataQueryDto());
    return {
      service,
      task,
      fileId: files.data[0].id,
      existing: listed.data[0],
    };
  }

  it('creates, reads, updates, and deletes one merged row', async () => {
    const { service, task, fileId, existing } = await setup();
    const created = await service.createData(task.id, {
      fileId,
      sourceRowNumber: 8,
      values: { name: 'Neha', mobile: '9666666666', city: 'Nashik' },
    });
    expect(created).toMatchObject({
      fileId,
      fileName: 'ward-a.xlsx',
      sourceRowNumber: 8,
      values: { name: 'Neha', mobile: '9666666666', city: 'Nashik' },
      originalValues: { Name: 'Neha', Mobile: '9666666666', City: 'Nashik' },
    });
    expect(await service.getData(task.id, created.id)).toMatchObject({
      id: created.id,
      values: { name: 'Neha' },
    });
    expect(await service.getFile(task.id, fileId)).toMatchObject({
      validCount: 2,
    });

    const updated = await service.updateData(task.id, created.id, {
      values: { city: 'Mumbai' },
    });
    expect(updated.values.city).toBe('Mumbai');
    expect(updated.originalValues).toMatchObject({ City: 'Nashik' });

    await expect(
      service.updateData(task.id, created.id, { values: { mobile: 'nope' } }),
    ).rejects.toThrow('Row still has invalid values');
    expect((await service.getData(task.id, created.id)).values).toMatchObject({
      mobile: '9666666666',
      city: 'Mumbai',
    });

    expect(await service.deleteData(task.id, created.id)).toEqual({
      deleted: true,
    });
    await expect(service.getData(task.id, created.id)).rejects.toThrow(
      'Data row not found',
    );
    expect(await service.getFile(task.id, fileId)).toMatchObject({
      validCount: 1,
    });
    expect(
      (await service.listData(task.id, new ListTaskDataQueryDto())).data.map(
        (row) => row.id,
      ),
    ).toEqual([existing.id]);
  });

  it('adds a row directly to the merged data', async () => {
    const { service, task } = await setup();
    const created = await service.createData(task.id, {
      values: { name: 'Manual', mobile: '9555555555', city: 'Pune' },
    });
    expect(created.fileId).toBeNull();
    expect(created.sourceRowNumber).toBeNull();

    const exported = await service.exportMaster(task.id);
    expect(await readExport(exported.buffer)).toEqual([
      ['SN', 'Name', 'Mobile', 'City'],
      [1, 'Rahul', '9999999999', 'Pune'],
      [2, 'Manual', '9555555555', 'Pune'],
    ]);
  });

  it('creates, updates, and deletes rows in bulk', async () => {
    const { service, task, fileId } = await setup();
    const mobileId = task.columns.find(
      (column) => column.label === 'Mobile',
    )?.id;
    if (!mobileId) {
      throw new Error('expected a Mobile column');
    }
    await service.updateColumn(task.id, mobileId, { primary: true });

    const created = await service.createDataBulk(task.id, {
      rows: [
        { values: { name: 'Asha', mobile: '9777777777', city: 'Delhi' } },
        {
          fileId,
          values: { name: 'Kiran', mobile: '9888888888', city: 'Nashik' },
        },
      ],
    });
    expect(created.count).toBe(2);
    expect(await service.getFile(task.id, fileId)).toMatchObject({
      validCount: 2,
    });

    await expect(
      service.createData(task.id, {
        values: { name: 'Dup', mobile: '9999999999', city: 'Pune' },
      }),
    ).rejects.toMatchObject({
      response: {
        message: 'Row has invalid values',
        remainingProblems: [
          expect.objectContaining({
            message: 'Mobile "9999999999" is already in the merged data',
          }),
        ],
      },
    });
    await expect(
      service.createDataBulk(task.id, {
        rows: [
          { values: { name: 'One', mobile: '9111111111', city: 'Pune' } },
          { values: { name: 'Two', mobile: '9111111111', city: 'Mumbai' } },
        ],
      }),
    ).rejects.toMatchObject({
      response: {
        message: 'Some rows have invalid values',
        rows: [
          expect.objectContaining({
            index: 1,
            remainingProblems: [
              expect.objectContaining({
                message: 'Mobile "9111111111" is duplicated in this request',
              }),
            ],
          }),
        ],
      },
    });
    expect(
      (await service.listData(task.id, new ListTaskDataQueryDto())).data,
    ).toHaveLength(3);

    const sameValue = await service.updateDataBulk(task.id, {
      ids: created.data.map((row) => row.id),
      values: { city: 'Pune' },
    });
    expect(sameValue.data.map((row) => row.values.city)).toEqual([
      'Pune',
      'Pune',
    ]);

    await expect(
      service.updateDataBulk(task.id, {
        ids: created.data.map((row) => row.id),
        values: { mobile: '9000000000' },
      }),
    ).rejects.toMatchObject({
      response: {
        rows: [
          expect.objectContaining({
            id: created.data[1].id,
            remainingProblems: [
              expect.objectContaining({
                message: 'Mobile "9000000000" is duplicated in this request',
              }),
            ],
          }),
        ],
      },
    });
    expect(
      (await service.getData(task.id, created.data[0].id)).values.mobile,
    ).toBe('9777777777');

    const perRow = await service.updateDataBulk(task.id, {
      rows: [
        { id: created.data[0].id, values: { city: 'Delhi' } },
        { id: created.data[1].id, values: { name: 'Kiran S' } },
      ],
    });
    expect(perRow).toMatchObject({ updated: true, count: 2 });
    expect(perRow.data[0].values.city).toBe('Delhi');
    expect(perRow.data[0].originalValues).toMatchObject({ City: 'Delhi' });
    expect(perRow.data[1].values).toMatchObject({
      name: 'Kiran S',
      city: 'Pune',
    });

    await expect(
      service.updateDataBulk(task.id, {
        rows: [
          { id: created.data[0].id, values: { mobile: '9999999999' } },
          { id: created.data[1].id, values: { city: 'Mumbai' } },
        ],
      }),
    ).rejects.toThrow('Some rows still have invalid values');
    expect(
      (await service.getData(task.id, created.data[1].id)).values.city,
    ).toBe('Pune');

    expect(
      await service.deleteDataBulk(task.id, [
        created.data[0].id,
        created.data[1].id,
        created.data[1].id,
      ]),
    ).toEqual({ deleted: true, count: 2 });
    expect(await service.getFile(task.id, fileId)).toMatchObject({
      validCount: 1,
    });
    expect(
      (await service.listData(task.id, new ListTaskDataQueryDto())).data.map(
        (row) => row.values.name,
      ),
    ).toEqual(['Rahul']);
  });

  it('sorts merged rows by a numeric output column', async () => {
    const { service, task } = await setup();
    await service.addColumns(task.id, [
      {
        label: 'No of Participants',
        dataType: TaskColumnDataType.INTEGER,
      },
    ]);
    await service.createData(task.id, {
      values: {
        name: 'Asha',
        mobile: '9777777777',
        city: 'Delhi',
        no_of_participants: 2,
      },
    });
    await service.createData(task.id, {
      values: {
        name: 'Neha',
        mobile: '9666666666',
        city: 'Nashik',
        no_of_participants: 10,
      },
    });

    const ascending = Object.assign(new ListTaskDataQueryDto(), {
      sort: 'no_of_participants',
      order: ListSortOrder.ASC,
    });
    const descending = Object.assign(new ListTaskDataQueryDto(), {
      sort: 'no_of_participants',
      order: ListSortOrder.DESC,
    });
    expect(
      (await service.listData(task.id, ascending)).data.map(
        (row) => row.values.name,
      ),
    ).toEqual(['Asha', 'Neha', 'Rahul']);
    expect(
      (await service.listData(task.id, descending)).data.map(
        (row) => row.values.name,
      ),
    ).toEqual(['Neha', 'Asha', 'Rahul']);

    const exported = await service.exportMaster(task.id, {
      sort: 'no_of_participants',
      order: ListSortOrder.DESC,
    });
    const sheet = await readExport(exported.buffer);
    expect(sheet[0]).toEqual([
      'SN',
      'Name',
      'Mobile',
      'City',
      'No of Participants',
    ]);
    expect(sheet.slice(1).map((row) => row[0])).toEqual([1, 2, 3]);
    expect(sheet.slice(1).map((row) => row[1])).toEqual([
      'Neha',
      'Asha',
      'Rahul',
    ]);
    expect(sheet.slice(1).map((row) => row[4])).toEqual([10, 2, null]);
  });

  it('saves a summary setup and writes it on the Summary sheet', async () => {
    const { service } = createService();
    const task = await service.createTask(USER, {
      name: 'Janmashtami',
      columns: [
        { label: 'Taluka', dataType: TaskColumnDataType.STRING },
        { label: 'Group', dataType: TaskColumnDataType.STRING },
        { label: 'Kind', dataType: TaskColumnDataType.STRING },
        { label: 'Teams', dataType: TaskColumnDataType.INTEGER },
      ],
    });
    const rows = [
      ['Pune', 'Zone 2', 'Yuva Kendra', 4],
      ['Pune', 'Zone 1', 'DPC', 1],
      ['Pune', 'Zone 1', 'Yuva Kendra', 2],
      ['Nashik', 'Zone 1', 'Yuva Kendra', 3],
    ];
    for (const [taluka, group, kind, teams] of rows) {
      await service.createData(task.id, {
        values: { taluka, group, kind, teams },
      });
    }

    const saved = await service.updateSummary(task.id, {
      rowColumn: 'taluka',
      columnColumn: 'group',
      totalLabel: 'Total',
      metrics: [
        {
          label: 'Total Number of Kendra',
          op: 'count',
          when: [{ column: 'kind', equals: 'Yuva Kendra' }],
        },
        { label: 'Total Teams', op: 'sum', column: 'teams' },
      ],
    });
    expect(saved.summary).toMatchObject({
      rowColumn: 'taluka',
      columnColumn: 'group',
      totalLabel: 'Total',
    });
    expect((await service.getTask(task.id)).summary).toMatchObject({
      totalLabel: 'Total',
    });

    const exported = await service.exportMaster(task.id, {
      totalLabel: 'Jilla Total',
    });
    expect((await service.getSummary(task.id)).summary?.totalLabel).toBe(
      'Jilla Total',
    );
    expect(await readExport(exported.buffer, 'Summary')).toEqual([
      [null, 'Pune', 'Jilla Total', 'Zone 1', 'Zone 2'],
      [null, 'Total Number of Kendra', 2, 1, 1],
      [null, 'Total Teams', 7, 3, 4],
      [null, null, null, null, null],
      [null, 'Nashik', 'Jilla Total', 'Zone 1', null],
      [null, 'Total Number of Kendra', 1, 1, null],
      [null, 'Total Teams', 3, 3, null],
    ]);

    const replaced = await service.updateSummary(task.id, {
      rowColumn: 'taluka',
      columnColumn: 'group',
      totalLabel: 'Total',
      metrics: [{ label: 'Rows', op: 'count' }],
    });
    expect(replaced.summary.metrics).toEqual([{ label: 'Rows', op: 'count' }]);
  });
});
