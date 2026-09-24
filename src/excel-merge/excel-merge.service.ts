import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as ExcelJS from 'exceljs';
import { FindOptionsWhere, Repository } from 'typeorm';
import { ExcelAnalyzerService } from './excel-analyzer.service';
import { cellToString, normalizeHeader, toColumnKey } from './excel-cell.util';
import { isXlsxZip, toExcelBuffer } from './excel-buffer.util';
import {
  BulkCreateTaskDataDto,
  BulkUpdateTaskDataDto,
  ConfirmMappingDto,
  CreateMergeTaskDto,
  CreateTaskColumnDto,
  CreateTaskDataDto,
  SaveTaskSummaryDto,
  UpdateMergeTaskDto,
  UpdateTaskColumnDto,
  UpdateTaskDataDto,
  UpdateTaskErrorDto,
} from './dto/excel-merge.dto';
import {
  ExportTaskDataQueryDto,
  ListMergeFilesQueryDto,
  ListMergeTasksQueryDto,
  ListSortOrder,
  ListTaskDataQueryDto,
  ListTaskErrorsQueryDto,
  MERGE_ERROR_SORT_FIELDS,
  MERGE_FILE_SORT_FIELDS,
  MERGE_ROW_SORT_FIELDS,
  MERGE_TASK_SORT_FIELDS,
} from './dto/list-excel-merge-query.dto';
import { MergeTaskColumn } from './entities/task-column.entity';
import { MergeTaskData } from './entities/task-data.entity';
import { MergeTaskError } from './entities/task-error.entity';
import { MergeTask } from './entities/merge-task.entity';
import { MergeUploadedFile } from './entities/uploaded-file.entity';
import {
  PrimaryValueIndex,
  RowValidationResult,
  validateMappedRow,
} from './excel-row.validator';
import {
  DetectedColumn,
  FieldError,
  FileColumnMapping,
  MergeErrorStatus,
  MergeFileStatus,
  SavedColumnMapping,
  SuggestedMapping,
  SummaryMetric,
  TaskColumnDataType,
  TaskSummaryConfig,
} from './excel-merge.types';

const FILE_BATCH = 500;
const BULK_DATA_LIMIT = 500;

@Injectable()
export class ExcelMergeService {
  constructor(
    @InjectRepository(MergeTask)
    private readonly tasks: Repository<MergeTask>,
    @InjectRepository(MergeTaskColumn)
    private readonly columns: Repository<MergeTaskColumn>,
    @InjectRepository(MergeUploadedFile)
    private readonly files: Repository<MergeUploadedFile>,
    @InjectRepository(MergeTaskData)
    private readonly data: Repository<MergeTaskData>,
    @InjectRepository(MergeTaskError)
    private readonly errors: Repository<MergeTaskError>,
    private readonly analyzer: ExcelAnalyzerService,
  ) {}

  async createTask(createdBy: string, dto: CreateMergeTaskDto) {
    const task = await this.tasks.save(
      this.tasks.create({
        name: dto.name.trim(),
        description: dto.description?.trim() || null,
        createdBy,
        columnMappings: {},
        // Deprecated column. Output format is the task's columns.
        frozenHeaders: [],
      }),
    );

    if (dto.columns?.length) {
      await this.addColumns(task.id, dto.columns);
    }

    return this.getTask(task.id);
  }

  async listTasks(query: ListMergeTasksQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const [rows, total] = await this.tasks.findAndCount({
      order: this.entityOrder(
        query.sort,
        query.order,
        MERGE_TASK_SORT_FIELDS,
        { createdAt: 'DESC' },
      ),
      skip: (page - 1) * limit,
      take: limit,
    });

    const summaries = await Promise.all(
      rows.map(async (task) => {
        const [columnCount, fileCount, validCount, errorCount] =
          await Promise.all([
            this.columns.count({ where: { taskId: task.id } }),
            this.files.count({ where: { taskId: task.id } }),
            this.data.count({ where: { taskId: task.id } }),
            this.errors.count({
              where: { taskId: task.id, status: MergeErrorStatus.PENDING },
            }),
          ]);
        return {
          ...this.toTaskSummary(task),
          columnCount,
          fileCount,
          validCount,
          pendingErrorCount: errorCount,
        };
      }),
    );

    return {
      data: summaries,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }

  async getTask(taskId: string) {
    const task = await this.requireTask(taskId);
    const columns = await this.listColumns(taskId);
    const [fileCount, validCount, pendingErrorCount] = await Promise.all([
      this.files.count({ where: { taskId } }),
      this.data.count({ where: { taskId } }),
      this.errors.count({
        where: { taskId, status: MergeErrorStatus.PENDING },
      }),
    ]);
    return {
      ...this.toTaskSummary(task),
      columns,
      fileCount,
      validCount,
      pendingErrorCount,
      columnMappings: task.columnMappings,
      summary: task.summaryConfig ?? null,
    };
  }

  async getSummary(taskId: string) {
    const task = await this.requireTask(taskId);
    return { summary: task.summaryConfig ?? null };
  }

  async updateSummary(taskId: string, dto: SaveTaskSummaryDto) {
    const task = await this.requireTask(taskId);
    const columns = await this.loadColumns(taskId);
    const summary = this.checkedSummary(columns, {
      rowColumn: dto.rowColumn,
      columnColumn: dto.columnColumn,
      totalLabel: dto.totalLabel.trim(),
      metrics: dto.metrics.map((metric) => ({
        label: metric.label.trim(),
        op: metric.op,
        column: metric.column,
        when: metric.when,
      })),
    });
    task.summaryConfig = summary;
    await this.tasks.save(task);
    return { summary };
  }

  async updateTask(taskId: string, dto: UpdateMergeTaskDto) {
    const task = await this.requireTask(taskId);
    if (dto.name !== undefined) {
      task.name = dto.name.trim();
    }
    if (dto.description !== undefined) {
      task.description = dto.description.trim() || null;
    }
    await this.tasks.save(task);
    return this.getTask(taskId);
  }

  async deleteTask(taskId: string) {
    await this.requireTask(taskId);
    await this.tasks.delete(taskId);
    return { deleted: true };
  }

  async listColumns(taskId: string) {
    await this.requireTask(taskId);
    const columns = await this.columns.find({
      where: { taskId },
      order: { sortOrder: 'ASC', createdAt: 'ASC' },
    });
    return columns.map((column) => this.toColumn(column));
  }

  async addColumns(taskId: string, dtos: CreateTaskColumnDto[]) {
    await this.requireTask(taskId);
    this.assertSinglePrimary(dtos.filter((dto) => dto.primary).length);
    if (dtos.some((dto) => dto.primary)) {
      await this.columns.update({ taskId }, { primary: false });
    }
    const existing = await this.columns.find({ where: { taskId } });
    const used = new Set(existing.map((column) => column.key));
    const knownLabels = existing.map((column) => column.label);
    let sortOrder =
      existing.reduce((max, column) => Math.max(max, column.sortOrder), -1) + 1;

    const created = dtos.map((dto) => {
      const label = this.outputColumnLabel(dto.label);
      this.assertUniqueOutputLabel(
        knownLabels.map((existingLabel) => ({ label: existingLabel })),
        label,
      );
      knownLabels.push(label);
      const column = this.columns.create({
        taskId,
        key: toColumnKey(label, used),
        label,
        dataType: dto.dataType ?? TaskColumnDataType.STRING,
        required: dto.required ?? false,
        primary: dto.primary ?? false,
        sortOrder: dto.sortOrder ?? sortOrder,
      });
      sortOrder += 1;
      return column;
    });

    await this.columns.save(created);
    return this.listColumns(taskId);
  }

  async updateColumn(
    taskId: string,
    columnId: string,
    dto: UpdateTaskColumnDto,
  ) {
    const column = await this.requireColumn(taskId, columnId);
    if (dto.label !== undefined) {
      const label = this.outputColumnLabel(dto.label);
      const existing = await this.columns.find({ where: { taskId } });
      this.assertUniqueOutputLabel(
        existing.filter((item) => item.id !== column.id),
        label,
      );
      column.label = label;
    }
    if (dto.dataType !== undefined) {
      column.dataType = dto.dataType;
    }
    if (dto.required !== undefined) {
      column.required = dto.required;
    }
    if (dto.primary === true) {
      await this.columns.update({ taskId }, { primary: false });
      column.primary = true;
    } else if (dto.primary === false) {
      column.primary = false;
    }
    if (dto.sortOrder !== undefined) {
      column.sortOrder = dto.sortOrder;
    }
    await this.columns.save(column);
    return this.toColumn(column);
  }

  async deleteColumn(taskId: string, columnId: string) {
    await this.requireTask(taskId);
    await this.requireColumn(taskId, columnId);
    await this.columns.delete({ id: columnId, taskId });
    return { deleted: true };
  }

  async uploadFiles(
    taskId: string,
    uploadedBy: string,
    files: Express.Multer.File[],
  ) {
    await this.requireTask(taskId);
    if (!files?.length) {
      throw new BadRequestException(
        'No files uploaded (field name must be "files")',
      );
    }

    const results: Awaited<ReturnType<ExcelMergeService['getFile']>>[] = [];
    for (const file of files) {
      results.push(await this.uploadOne(taskId, uploadedBy, file));
    }
    return { files: results };
  }

  async listFiles(taskId: string, query: ListMergeFilesQueryDto) {
    await this.requireTask(taskId);
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where: FindOptionsWhere<MergeUploadedFile> = { taskId };
    if (query.status) {
      where.status = query.status;
    }
    const [rows, total] = await this.files.findAndCount({
      where,
      order: this.entityOrder(
        query.sort,
        query.order,
        MERGE_FILE_SORT_FIELDS,
        { createdAt: 'DESC' },
      ),
      skip: (page - 1) * limit,
      take: limit,
    });
    return {
      data: rows.map((file) => this.toFile(file)),
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }

  async getFile(taskId: string, fileId: string) {
    const [task, file] = await Promise.all([
      this.requireTask(taskId),
      this.requireFile(taskId, fileId),
    ]);
    const columns = await this.columns.find({
      where: { taskId },
      order: { sortOrder: 'ASC' },
    });
    return {
      ...this.toFile(file),
      analysis: file.analysis,
      columnMapping: file.columnMapping,
      suggestedMappings: this.suggestMappings(task, file, columns),
      review: this.mappingReview(file, columns),
    };
  }

  async confirmMapping(taskId: string, fileId: string, dto: ConfirmMappingDto) {
    const task = await this.requireTask(taskId);
    const file = await this.requireFile(taskId, fileId, true);

    if (dto.sheetName || dto.headerRow) {
      await this.applySheetOverride(file, dto.sheetName, dto.headerRow);
    }

    if (!file.analysis?.columns?.length) {
      throw new BadRequestException(
        'Could not detect columns in this file. Choose a sheet and header row first.',
      );
    }

    const columns = await this.columns.find({ where: { taskId } });
    const planned = this.planMappings(dto, file, columns);
    if (planned.creates.some((item) => item.primary)) {
      await this.columns.update({ taskId }, { primary: false });
    }
    if (planned.creates.length) {
      await this.columns.save(
        planned.creates.map((item) =>
          this.columns.create({
            taskId,
            key: item.columnKey,
            label: item.label,
            dataType: item.dataType,
            required: item.required,
            primary: item.primary,
            sortOrder: item.sortOrder,
          }),
        ),
      );
    }

    const resolved = planned.resolved;

    file.columnMapping = resolved;
    file.status = MergeFileStatus.MAPPING_CONFIRMED;
    file.failureMessage = null;
    await this.files.update(file.id, {
      columnMapping: resolved,
      status: MergeFileStatus.MAPPING_CONFIRMED,
      failureMessage: null,
      selectedSheet: file.selectedSheet,
      headerRow: file.headerRow,
      analysis: file.analysis,
    });

    task.columnMappings = {
      ...(task.columnMappings ?? {}),
      ...planned.learned,
    };
    await this.tasks.save(task);

    const shouldProcess = dto.process !== false;
    if (shouldProcess) {
      return this.processFile(taskId, fileId);
    }

    return this.getFile(taskId, fileId);
  }

  async processFile(taskId: string, fileId: string) {
    const file = await this.requireFile(taskId, fileId, true);
    if (!file.columnMapping?.length) {
      throw new BadRequestException(
        'Confirm column mapping before processing this file',
      );
    }
    if (!file.fileData) {
      throw new BadRequestException(
        'Original Excel file is no longer available. Please re-upload the file.',
      );
    }

    const columns = await this.columns.find({
      where: { taskId },
      order: { sortOrder: 'ASC' },
    });
    if (columns.length === 0) {
      throw new BadRequestException(
        'Add at least one output column before processing',
      );
    }

    file.status = MergeFileStatus.PROCESSING;
    await this.files.update(file.id, {
      status: MergeFileStatus.PROCESSING,
    });

    try {
      const workbook = await this.analyzer.loadWorkbook(file.fileData);
      const sheetName = file.selectedSheet ?? file.analysis?.selectedSheet;
      const sheet = sheetName
        ? workbook.getWorksheet(sheetName)
        : workbook.worksheets[0];
      if (!sheet) {
        throw new BadRequestException('Selected sheet was not found');
      }
      const headerRow = file.headerRow ?? file.analysis?.headerRow ?? 1;

      await this.data.delete({ fileId: file.id });
      await this.errors.delete({ fileId: file.id });

      const mappedColumns = file.columnMapping.filter(
        (item) => item.action === 'map' && item.columnKey,
      );
      const primary = this.primaryColumn(columns);
      const primaryIndex = primary
        ? new PrimaryValueIndex(
            (await this.data.find({ where: { taskId } })).map(
              (row) => row.data?.[primary.key],
            ),
          )
        : null;

      let totalRows = 0;
      let validCount = 0;
      let errorCount = 0;
      const pendingValid: MergeTaskData[] = [];
      const pendingErrors: MergeTaskError[] = [];

      for (
        let rowNumber = headerRow + 1;
        rowNumber <= sheet.rowCount;
        rowNumber++
      ) {
        const row = sheet.getRow(rowNumber);
        const originalData: Record<string, unknown> = {};
        let empty = true;
        for (const mapping of file.columnMapping) {
          const text = cellToString(row.getCell(mapping.sourceIndex).value);
          originalData[mapping.sourceHeader] = text;
          if (text) {
            empty = false;
          }
        }
        if (empty) {
          continue;
        }

        totalRows += 1;
        const mapped: Record<string, unknown> = {};
        for (const mapping of mappedColumns) {
          mapped[mapping.columnKey!] = originalData[mapping.sourceHeader] ?? '';
        }

        const result = validateMappedRow(columns, mapped, originalData);
        this.applyPrimaryCheck(primary, primaryIndex, result);
        if (result.valid) {
          validCount += 1;
          pendingValid.push(
            this.data.create({
              taskId,
              fileId: file.id,
              sourceRowNumber: rowNumber,
              data: result.data,
              originalData,
            }),
          );
        } else {
          errorCount += 1;
          pendingErrors.push(
            this.errors.create({
              taskId,
              fileId: file.id,
              sourceRowNumber: rowNumber,
              originalData,
              mappedData: result.data,
              fieldErrors: result.fieldErrors,
              status: MergeErrorStatus.PENDING,
            }),
          );
        }

        if (pendingValid.length >= FILE_BATCH) {
          await this.data.save(pendingValid.splice(0));
        }
        if (pendingErrors.length >= FILE_BATCH) {
          await this.errors.save(pendingErrors.splice(0));
        }
      }

      if (pendingValid.length) {
        await this.data.save(pendingValid);
      }
      if (pendingErrors.length) {
        await this.errors.save(pendingErrors);
      }

      file.totalRows = totalRows;
      file.validCount = validCount;
      file.errorCount = errorCount;
      file.status = MergeFileStatus.PROCESSED;
      file.processedAt = new Date();
      file.failureMessage = null;
      await this.files.update(file.id, {
        totalRows,
        validCount,
        errorCount,
        status: MergeFileStatus.PROCESSED,
        processedAt: file.processedAt,
        failureMessage: null,
      });

      return this.getFile(taskId, fileId);
    } catch (error) {
      file.status = MergeFileStatus.FAILED;
      file.failureMessage =
        error instanceof Error ? error.message : 'Failed to process file';
      await this.files.update(file.id, {
        status: MergeFileStatus.FAILED,
        failureMessage: file.failureMessage,
      });
      throw error;
    }
  }

  async listData(taskId: string, query: ListTaskDataQueryDto) {
    await this.requireTask(taskId);
    const page = query.page ?? 1;
    const limit = query.limit ?? 50;
    const columnRows = await this.columns.find({
      where: { taskId },
      order: { sortOrder: 'ASC', createdAt: 'ASC' },
    });
    const orders = this.valueOrder(
      'data',
      columnRows,
      query.sort,
      query.order,
      [{ expression: 'row.createdAt', direction: 'ASC' }],
      MERGE_ROW_SORT_FIELDS,
    );
    const qb = this.data
      .createQueryBuilder('row')
      .leftJoinAndSelect('row.file', 'file')
      .where('row.taskId = :taskId', { taskId });
    if (query.fileId) {
      qb.andWhere('row.fileId = :fileId', { fileId: query.fileId });
    }
    this.applyOrder(qb, orders);
    const [rows, total] = await qb
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();
    const columns = columnRows.map((column) => this.toColumn(column));
    return {
      columns,
      data: rows.map((row) => this.toDataRow(row, columns)),
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }

  async getData(taskId: string, dataId: string) {
    await this.requireTask(taskId);
    const columns = await this.loadColumns(taskId);
    const row = await this.requireDataRow(taskId, dataId);
    return this.toDataRow(row, columns);
  }

  async createData(taskId: string, dto: CreateTaskDataDto) {
    const [row] = await this.insertDataRows(taskId, [dto]);
    return row;
  }

  async createDataBulk(taskId: string, dto: BulkCreateTaskDataDto) {
    const data = await this.insertDataRows(taskId, dto.rows);
    return { count: data.length, data };
  }

  async updateData(taskId: string, dataId: string, dto: UpdateTaskDataDto) {
    const [row] = await this.applyDataChanges(
      taskId,
      [{ id: dataId, values: dto.values }],
      true,
    );
    return row;
  }

  async updateDataBulk(taskId: string, dto: BulkUpdateTaskDataDto) {
    const data = await this.applyDataChanges(
      taskId,
      this.bulkDataChanges(dto),
    );
    return { updated: true, count: data.length, data };
  }

  async deleteData(taskId: string, dataId: string) {
    await this.deleteDataRows(taskId, [dataId]);
    return { deleted: true };
  }

  async deleteDataBulk(taskId: string, ids: string[]) {
    const count = await this.deleteDataRows(taskId, ids);
    return { deleted: true, count };
  }

  async listErrors(taskId: string, query: ListTaskErrorsQueryDto) {
    await this.requireTask(taskId);
    const page = query.page ?? 1;
    const limit = query.limit ?? 50;
    const status = query.status ?? MergeErrorStatus.PENDING;
    const columns = await this.columns.find({
      where: { taskId },
      order: { sortOrder: 'ASC', createdAt: 'ASC' },
    });
    const orders = this.valueOrder(
      'mappedData',
      columns,
      query.sort,
      query.order,
      [
        { expression: 'row.sourceRowNumber', direction: 'ASC' },
        { expression: 'row.createdAt', direction: 'ASC' },
      ],
      MERGE_ERROR_SORT_FIELDS,
    );
    const qb = this.errors
      .createQueryBuilder('row')
      .leftJoinAndSelect('row.file', 'file')
      .where('row.taskId = :taskId', { taskId })
      .andWhere('row.status = :status', { status });
    if (query.fileId) {
      qb.andWhere('row.fileId = :fileId', { fileId: query.fileId });
    }
    this.applyOrder(qb, orders);
    const [rows, total] = await qb
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();
    return {
      data: rows.map((row) => this.toErrorReview(row, columns)),
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }

  async updateError(taskId: string, errorId: string, dto: UpdateTaskErrorDto) {
    const columns = await this.columns.find({
      where: { taskId },
      order: { sortOrder: 'ASC' },
    });
    const row = await this.errors.findOne({
      where: { id: errorId, taskId },
      relations: { file: true },
    });
    if (!row) {
      throw new NotFoundException('Error row not found');
    }
    if (row.status === MergeErrorStatus.RESOLVED) {
      throw new BadRequestException('This row has already been approved');
    }

    const mapped = { ...row.mappedData, ...dto.values };
    const result = validateMappedRow(columns, mapped, row.originalData);
    const primary = this.primaryColumn(columns);
    if (primary) {
      const primaryIndex = new PrimaryValueIndex(
        (await this.data.find({ where: { taskId } })).map(
          (existing) => existing.data?.[primary.key],
        ),
      );
      this.applyPrimaryCheck(primary, primaryIndex, result);
    }
    row.mappedData = result.data;
    row.fieldErrors = result.fieldErrors;

    if (dto.approve) {
      if (!result.valid) {
        await this.errors.save(row);
        return {
          approved: false,
          remainingProblems: result.fieldErrors,
          row: this.toErrorReview(row, columns),
        };
      }
      await this.data.save(
        this.data.create({
          taskId,
          fileId: row.fileId,
          sourceRowNumber: row.sourceRowNumber,
          data: result.data,
          originalData: row.originalData,
        }),
      );
      row.status = MergeErrorStatus.RESOLVED;
      row.resolvedAt = new Date();
      row.fieldErrors = [];
      await this.errors.save(row);
      await this.files.increment({ id: row.fileId }, 'validCount', 1);
      await this.files.decrement({ id: row.fileId }, 'errorCount', 1);
      return {
        approved: true,
        remainingProblems: [],
        row: this.toErrorReview(row, columns),
      };
    }

    await this.errors.save(row);
    return {
      approved: false,
      remainingProblems: result.fieldErrors,
      row: this.toErrorReview(row, columns),
    };
  }

  async deleteError(taskId: string, errorId: string) {
    await this.deletePendingErrors(taskId, [errorId]);
    return { deleted: true };
  }

  async deleteErrors(taskId: string, ids: string[]) {
    const count = await this.deletePendingErrors(taskId, ids);
    return { deleted: true, count };
  }

  private async deletePendingErrors(taskId: string, ids: string[]) {
    const unique = [...new Set(ids)];
    if (unique.length === 0) {
      throw new BadRequestException('Choose at least one error row to delete');
    }

    const rows: MergeTaskError[] = [];
    for (const id of unique) {
      const row = await this.errors.findOne({ where: { id, taskId } });
      if (!row) {
        throw new NotFoundException('Error row not found');
      }
      if (row.status !== MergeErrorStatus.PENDING) {
        throw new BadRequestException('Only pending error rows can be deleted');
      }
      rows.push(row);
    }

    const removedByFile = new Map<string, number>();
    for (const row of rows) {
      await this.errors.delete({ id: row.id, taskId });
      removedByFile.set(row.fileId, (removedByFile.get(row.fileId) ?? 0) + 1);
    }
    for (const [fileId, count] of removedByFile) {
      await this.files.decrement({ id: fileId }, 'errorCount', count);
    }
    return rows.length;
  }

  async exportMaster(
    taskId: string,
    query: ExportTaskDataQueryDto = {},
  ): Promise<{
    buffer: Buffer;
    fileName: string;
  }> {
    const task = await this.requireTask(taskId);
    const columns = await this.columns.find({
      where: { taskId },
      order: { sortOrder: 'ASC', createdAt: 'ASC' },
    });
    if (columns.length === 0) {
      throw new BadRequestException(
        'This task has no output columns to export',
      );
    }

    const orders = this.valueOrder(
      'data',
      columns,
      query.sort,
      query.order,
      [{ expression: 'row.createdAt', direction: 'ASC' }],
      MERGE_ROW_SORT_FIELDS,
    );
    const qb = this.data
      .createQueryBuilder('row')
      .leftJoinAndSelect('row.file', 'file')
      .where('row.taskId = :taskId', { taskId });
    this.applyOrder(qb, orders);
    const rows = await qb.getMany();

    const summary = await this.summaryForExport(task, columns, query);
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Kendra');
    sheet.addRow(['SN', ...columns.map((column) => column.label)]);
    rows.forEach((row, index) => {
      const values = this.projectOutputValues(
        columns.map((column) => column.key),
        row.data,
      );
      sheet.addRow([
        index + 1,
        ...columns.map((column) => this.exportCell(values[column.key])),
      ]);
    });
    this.paintTable(sheet);
    if (summary?.metrics.length) {
      this.writeSummarySheet(workbook, rows, summary);
    }

    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    return {
      buffer,
      fileName: `${this.safeFileName(task.name)}-combined.xlsx`,
    };
  }

  async exportErrors(taskId: string): Promise<{
    buffer: Buffer;
    fileName: string;
  }> {
    const task = await this.requireTask(taskId);
    const columns = await this.columns.find({
      where: { taskId },
      order: { sortOrder: 'ASC' },
    });
    const rows = await this.errors.find({
      where: { taskId, status: MergeErrorStatus.PENDING },
      relations: { file: true },
      order: { createdAt: 'ASC' },
    });

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Errors');
    sheet.addRow([
      'File',
      'Original Row',
      ...columns.map((column) => column.label),
      'Problems',
    ]);
    for (const row of rows) {
      const values = this.projectOutputValues(
        columns.map((column) => column.key),
        row.mappedData,
      );
      sheet.addRow([
        row.file?.fileName ?? row.fileId,
        row.sourceRowNumber,
        ...columns.map((column) => this.exportCell(values[column.key])),
        row.fieldErrors
          .map((error) => `${error.label}: ${error.message}`)
          .join('; '),
      ]);
    }
    this.paintTable(sheet);

    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    return {
      buffer,
      fileName: `${this.safeFileName(task.name)}-errors.xlsx`,
    };
  }

  private async uploadOne(
    taskId: string,
    uploadedBy: string,
    file: Express.Multer.File,
  ) {
    if (!this.isExcel(file)) {
      throw new BadRequestException(
        `"${file.originalname}" is not an Excel file. Upload a .xlsx file.`,
      );
    }
    if (!isXlsxZip(file.buffer)) {
      throw new BadRequestException(
        `"${file.originalname}" is not a valid .xlsx file`,
      );
    }

    const fileBytes = toExcelBuffer(file.buffer);
    const saved = await this.files.save(
      this.files.create({
        taskId,
        fileName: file.originalname,
        fileSize: fileBytes.length,
        fileData: fileBytes,
        status: MergeFileStatus.UPLOADED,
        uploadedBy,
      }),
    );

    try {
      const analysis = await this.analyzer.analyze(fileBytes);
      saved.analysis = analysis;

      await this.files.update(saved.id, {
        analysis,
        selectedSheet: analysis.selectedSheet,
        headerRow: analysis.headerRow,
        status: MergeFileStatus.ANALYZED,
        failureMessage: null,
      });
      saved.selectedSheet = analysis.selectedSheet;
      saved.headerRow = analysis.headerRow;
      saved.status = MergeFileStatus.ANALYZED;
      saved.failureMessage = null;
    } catch (error) {
      const failureMessage =
        error instanceof Error ? error.message : 'Could not analyze file';
      await this.files.update(saved.id, {
        status: MergeFileStatus.FAILED,
        failureMessage,
      });
      saved.status = MergeFileStatus.FAILED;
      saved.failureMessage = failureMessage;
      if (error instanceof BadRequestException) {
        throw error;
      }
    }

    return this.getFile(taskId, saved.id);
  }

  private async applySheetOverride(
    file: MergeUploadedFile,
    sheetName?: string,
    headerRow?: number,
  ) {
    if (!file.fileData || !file.analysis) {
      return;
    }
    const workbook = await this.analyzer.loadWorkbook(file.fileData);
    const targetName =
      sheetName ?? file.selectedSheet ?? file.analysis.selectedSheet;
    const sheet = targetName
      ? workbook.getWorksheet(targetName)
      : workbook.worksheets[0];
    if (!sheet) {
      throw new BadRequestException(`Sheet "${targetName}" was not found`);
    }
    const analyzed = this.analyzer.analyzeSheet(sheet);
    if (headerRow) {
      const columns = this.readHeadersAt(sheet, headerRow);
      analyzed.headerRow = headerRow;
      analyzed.columns = columns;
      analyzed.columnCount = columns.length;
    }
    file.selectedSheet = sheet.name;
    file.headerRow = analyzed.headerRow;
    file.analysis = {
      ...file.analysis,
      selectedSheet: sheet.name,
      headerRow: analyzed.headerRow,
      columns: analyzed.columns,
      sheets: file.analysis.sheets.map((item) =>
        item.name === sheet.name ? analyzed : item,
      ),
    };
  }

  private readHeadersAt(sheet: ExcelJS.Worksheet, headerRow: number) {
    const analyzed = this.analyzer.analyzeSheet(sheet);
    if (analyzed.headerRow === headerRow) {
      return analyzed.columns;
    }
    const row = sheet.getRow(headerRow);
    const columns: DetectedColumn[] = [];
    row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      const header = cellToString(cell.value);
      if (header) {
        columns.push({
          index: colNumber,
          header,
          sampleValues: [],
          inferredType: TaskColumnDataType.STRING,
          emptyCount: 0,
          filledCount: 0,
        });
      }
    });
    return columns;
  }

  private suggestMappings(
    task: MergeTask,
    file: MergeUploadedFile,
    columns: MergeTaskColumn[],
  ): SuggestedMapping[] {
    const detected = file.analysis?.columns ?? [];
    const savedMappings = task.columnMappings ?? {};
    return detected.map((column) => {
      const saved = savedMappings[normalizeHeader(column.header)];
      if (saved?.action === 'ignore') {
        return {
          sourceHeader: column.header,
          sourceIndex: column.index,
          action: 'ignore' as const,
          columnKey: null,
          columnLabel: null,
          reason: 'saved' as const,
        };
      }
      if (saved?.action === 'map' && saved.columnKey) {
        const outputColumn = columns.find(
          (item) => item.key === saved.columnKey,
        );
        if (outputColumn) {
          return {
            sourceHeader: column.header,
            sourceIndex: column.index,
            action: 'map' as const,
            columnKey: outputColumn.key,
            columnLabel: outputColumn.label,
            reason: 'saved' as const,
          };
        }
      }

      const normalized = normalizeHeader(column.header);
      const nameMatches = columns.filter(
        (item) => normalizeHeader(item.label) === normalized,
      );
      if (nameMatches.length === 1) {
        const match = nameMatches[0];
        return {
          sourceHeader: column.header,
          sourceIndex: column.index,
          action: 'map' as const,
          columnKey: match.key,
          columnLabel: match.label,
          reason: 'name_match' as const,
        };
      }

      return {
        sourceHeader: column.header,
        sourceIndex: column.index,
        action: 'unmapped' as const,
        columnKey: null,
        columnLabel: null,
        reason: 'unmapped' as const,
      };
    });
  }

  private mappingReview(file: MergeUploadedFile, columns: MergeTaskColumn[]) {
    if (!file.columnMapping) {
      return null;
    }
    return file.columnMapping.map((mapping) => {
      const master = columns.find((column) => column.key === mapping.columnKey);
      return {
        sourceHeader: mapping.sourceHeader,
        action: mapping.action,
        columnKey: mapping.columnKey,
        columnLabel:
          mapping.action === 'ignore'
            ? 'Ignored'
            : (master?.label ?? mapping.columnKey),
      };
    });
  }

  private toErrorReview(row: MergeTaskError, columns: MergeTaskColumn[]) {
    return {
      id: row.id,
      fileId: row.fileId,
      fileName: row.file?.fileName ?? null,
      sourceRowNumber: row.sourceRowNumber,
      status: row.status,
      originalValues: row.originalData,
      fields: columns.map((column) => {
        const errors = row.fieldErrors.filter(
          (error) => error.columnKey === column.key,
        );
        const currentValue = row.mappedData[column.key] ?? null;
        return {
          columnKey: column.key,
          label: column.label,
          dataType: column.dataType,
          required: column.required,
          primary: column.primary ?? false,
          currentValue,
          originalValue: errors[0]?.originalValue ?? currentValue,
          valid:
            row.status === MergeErrorStatus.RESOLVED
              ? true
              : errors.length === 0,
          message: errors.map((error) => error.message).join('; ') || null,
        };
      }),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      resolvedAt: row.resolvedAt,
    };
  }

  private toTaskSummary(task: MergeTask) {
    return {
      id: task.id,
      name: task.name,
      description: task.description,
      createdBy: task.createdBy,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
    };
  }

  private toColumn(column: MergeTaskColumn) {
    return {
      id: column.id,
      key: column.key,
      label: column.label,
      dataType: column.dataType,
      required: column.required,
      primary: column.primary ?? false,
      sortOrder: column.sortOrder,
    };
  }

  private toFile(file: MergeUploadedFile) {
    return {
      id: file.id,
      taskId: file.taskId,
      fileName: file.fileName,
      fileSize: file.fileSize,
      status: file.status,
      selectedSheet: file.selectedSheet,
      headerRow: file.headerRow,
      totalRows: file.totalRows,
      validCount: file.validCount,
      errorCount: file.errorCount,
      failureMessage: file.failureMessage,
      uploadedBy: file.uploadedBy,
      processedAt: file.processedAt,
      createdAt: file.createdAt,
      updatedAt: file.updatedAt,
      columnCount: file.analysis?.columns.length ?? 0,
      sheetNames: file.analysis?.sheets.map((sheet) => sheet.name) ?? [],
    };
  }

  private planMappings(
    dto: ConfirmMappingDto,
    file: MergeUploadedFile,
    columns: MergeTaskColumn[],
  ): {
    resolved: FileColumnMapping[];
    learned: Record<string, SavedColumnMapping>;
    creates: Array<{
      columnKey: string;
      label: string;
      dataType: TaskColumnDataType;
      required: boolean;
      primary: boolean;
      sortOrder: number;
    }>;
  } {
    const detectedColumns = file.analysis?.columns ?? [];
    const usedKeys = new Set(columns.map((column) => column.key));
    const knownLabels = columns.map((column) => column.label);
    const claimedKeys = new Set<string>();
    let nextOrder =
      columns.reduce((max, column) => Math.max(max, column.sortOrder), -1) + 1;
    const resolved: FileColumnMapping[] = [];
    const learned: Record<string, SavedColumnMapping> = {};
    const creates: Array<{
      columnKey: string;
      label: string;
      dataType: TaskColumnDataType;
      required: boolean;
      primary: boolean;
      sortOrder: number;
    }> = [];
    let primaryCreate = false;

    for (const mapping of dto.mappings) {
      const detected = detectedColumns.find(
        (column) => column.header === mapping.sourceHeader,
      );
      if (!detected) {
        throw new BadRequestException(
          `Uploaded file has no column named "${mapping.sourceHeader}"`,
        );
      }

      if (mapping.action === 'ignore') {
        resolved.push({
          sourceHeader: mapping.sourceHeader,
          sourceIndex: detected.index,
          action: 'ignore',
          columnKey: null,
        });
        learned[normalizeHeader(mapping.sourceHeader)] = {
          sourceHeader: mapping.sourceHeader,
          action: 'ignore',
          columnKey: null,
        };
        continue;
      }

      if (mapping.action === 'create') {
        const label = this.outputColumnLabel(
          mapping.label?.trim() || mapping.sourceHeader,
        );
        this.assertUniqueOutputLabel(
          knownLabels.map((existingLabel) => ({ label: existingLabel })),
          label,
        );
        knownLabels.push(label);
        const columnKey = toColumnKey(label, usedKeys);
        const dataType = mapping.dataType ?? detected.inferredType;
        const required = mapping.required ?? false;
        const primary = mapping.primary ?? false;
        if (primary) {
          if (primaryCreate) {
            throw new BadRequestException(
              'A task can have only one primary column',
            );
          }
          primaryCreate = true;
        }
        creates.push({
          columnKey,
          label,
          dataType,
          required,
          primary,
          sortOrder: nextOrder,
        });
        nextOrder += 1;
        resolved.push({
          sourceHeader: mapping.sourceHeader,
          sourceIndex: detected.index,
          action: 'map',
          columnKey,
        });
        learned[normalizeHeader(mapping.sourceHeader)] = {
          sourceHeader: mapping.sourceHeader,
          action: 'map',
          columnKey,
        };
        continue;
      }

      const columnKey = mapping.columnKey ?? null;
      if (!columnKey) {
        throw new BadRequestException(
          `Mapping for "${mapping.sourceHeader}" needs an output column`,
        );
      }
      if (!columns.some((column) => column.key === columnKey)) {
        throw new BadRequestException(
          `Unknown output column "${columnKey}" for "${mapping.sourceHeader}"`,
        );
      }
      if (claimedKeys.has(columnKey)) {
        throw new BadRequestException(
          'Two uploaded columns cannot map to the same output column',
        );
      }
      claimedKeys.add(columnKey);
      resolved.push({
        sourceHeader: mapping.sourceHeader,
        sourceIndex: detected.index,
        action: 'map',
        columnKey,
      });
      learned[normalizeHeader(mapping.sourceHeader)] = {
        sourceHeader: mapping.sourceHeader,
        action: 'map',
        columnKey,
      };
    }

    return { resolved, learned, creates };
  }

  private outputColumnLabel(label: string): string {
    const trimmed = label.trim();
    if (!trimmed || !normalizeHeader(trimmed)) {
      throw new BadRequestException('Output column name cannot be empty');
    }
    return trimmed;
  }

  private assertUniqueOutputLabel(
    columns: Array<{ label: string }>,
    label: string,
  ) {
    const normalized = normalizeHeader(label);
    const duplicate = columns.find(
      (column) => normalizeHeader(column.label) === normalized,
    );
    if (duplicate) {
      throw new BadRequestException(
        `An output column named "${duplicate.label}" already exists`,
      );
    }
  }

  private primaryColumn(columns: MergeTaskColumn[]): MergeTaskColumn | null {
    const marked = columns.filter((column) => column.primary);
    if (marked.length > 1) {
      throw new BadRequestException('A task can have only one primary column');
    }
    return marked[0] ?? null;
  }

  private assertSinglePrimary(count: number) {
    if (count > 1) {
      throw new BadRequestException('A task can have only one primary column');
    }
  }

  private applyPrimaryCheck(
    primary: MergeTaskColumn | null,
    index: PrimaryValueIndex | null,
    result: RowValidationResult,
    scope: 'file' | 'request' = 'file',
  ) {
    if (!primary || !index) {
      return;
    }
    const duplicate = index.check(primary, result.data[primary.key], scope);
    if (duplicate) {
      result.fieldErrors.push(duplicate);
      result.valid = false;
    }
    if (result.valid) {
      index.remember(result.data[primary.key]);
    }
  }

  private async loadColumns(taskId: string) {
    return this.columns.find({
      where: { taskId },
      order: { sortOrder: 'ASC', createdAt: 'ASC' },
    });
  }

  private async requireDataRow(taskId: string, dataId: string) {
    const row = await this.data.findOne({
      where: { id: dataId, taskId },
      relations: { file: true },
    });
    if (!row) {
      throw new NotFoundException('Data row not found');
    }
    return row;
  }

  private assertKnownColumnKeys(
    columns: MergeTaskColumn[],
    values: Record<string, unknown>,
  ) {
    const unknown = Object.keys(values).filter(
      (key) => !columns.some((column) => column.key === key),
    );
    if (unknown.length > 0) {
      throw new BadRequestException(`Unknown output column "${unknown[0]}"`);
    }
  }

  private async primaryIndex(
    taskId: string,
    columns: MergeTaskColumn[],
    excludeIds: Set<string>,
  ) {
    const primary = this.primaryColumn(columns);
    if (!primary) {
      return { primary: null, index: null };
    }
    const existing = await this.data.find({ where: { taskId } });
    return {
      primary,
      index: new PrimaryValueIndex(
        existing
          .filter((row) => !excludeIds.has(row.id))
          .map((row) => row.data?.[primary.key]),
      ),
    };
  }

  private originalSnapshot(
    columns: MergeTaskColumn[],
    data: Record<string, unknown>,
  ): Record<string, unknown> {
    const original: Record<string, unknown> = {};
    for (const column of columns) {
      const value = data[column.key];
      original[column.label] = value === undefined ? null : value;
    }
    return original;
  }

  private async insertDataRows(taskId: string, items: CreateTaskDataDto[]) {
    if (items.length === 0) {
      throw new BadRequestException('Provide at least one row to add');
    }
    if (items.length > BULK_DATA_LIMIT) {
      throw new BadRequestException(
        `Add at most ${BULK_DATA_LIMIT} rows at once`,
      );
    }

    await this.requireTask(taskId);
    const columns = await this.loadColumns(taskId);
    if (columns.length === 0) {
      throw new BadRequestException(
        'Add at least one output column before adding rows',
      );
    }

    const files = new Map<string, MergeUploadedFile>();
    for (const item of items) {
      if (item.fileId && !files.has(item.fileId)) {
        files.set(item.fileId, await this.requireFile(taskId, item.fileId));
      }
    }

    const { primary, index } = await this.primaryIndex(
      taskId,
      columns,
      new Set(),
    );
    const pending: MergeTaskData[] = [];
    const failures: Array<{
      index: number;
      remainingProblems: FieldError[];
    }> = [];

    items.forEach((item, rowIndex) => {
      this.assertKnownColumnKeys(columns, item.values);
      if (Object.keys(item.values).length === 0) {
        throw new BadRequestException('Provide at least one value to add');
      }
      const result = validateMappedRow(columns, item.values, {});
      this.applyPrimaryCheck(primary, index, result, 'request');
      if (!result.valid) {
        failures.push({
          index: rowIndex,
          remainingProblems: result.fieldErrors,
        });
        return;
      }
      const file = item.fileId ? files.get(item.fileId) : undefined;
      pending.push(
        this.data.create({
          taskId,
          fileId: file?.id ?? null,
          sourceRowNumber: item.sourceRowNumber ?? null,
          data: result.data,
          originalData: this.originalSnapshot(columns, result.data),
        }),
      );
    });

    if (failures.length > 0) {
      if (items.length === 1) {
        throw new BadRequestException({
          message: 'Row has invalid values',
          remainingProblems: failures[0].remainingProblems,
        });
      }
      throw new BadRequestException({
        message: 'Some rows have invalid values',
        rows: failures,
      });
    }

    const saved = await this.data.save(pending);
    const savedRows = Array.isArray(saved) ? saved : [saved];
    const addedByFile = new Map<string, number>();
    for (const row of savedRows) {
      if (row.fileId) {
        row.file = files.get(row.fileId) ?? null;
        addedByFile.set(row.fileId, (addedByFile.get(row.fileId) ?? 0) + 1);
      }
    }
    for (const [fileId, count] of addedByFile) {
      await this.files.increment({ id: fileId }, 'validCount', count);
    }
    return savedRows.map((row) => this.toDataRow(row, columns));
  }

  private bulkDataChanges(dto: BulkUpdateTaskDataDto) {
    const hasRows = Boolean(dto.rows?.length);
    const hasIds = Boolean(dto.ids?.length);
    if (hasRows && (hasIds || dto.values)) {
      throw new BadRequestException(
        'Send either ids with values, or rows, not both',
      );
    }
    if (hasRows) {
      return dto.rows!;
    }
    if (hasIds) {
      return dto.ids!.map((id) => ({ id, values: dto.values ?? {} }));
    }
    throw new BadRequestException('Provide ids and values, or rows to update');
  }

  private async applyDataChanges(
    taskId: string,
    changes: Array<{ id: string; values: Record<string, unknown> }>,
    single = false,
  ) {
    if (changes.length === 0) {
      throw new BadRequestException('Provide at least one row to update');
    }
    if (changes.length > BULK_DATA_LIMIT) {
      throw new BadRequestException(
        `Update at most ${BULK_DATA_LIMIT} rows at once`,
      );
    }
    const seen = new Set<string>();
    for (const change of changes) {
      if (seen.has(change.id)) {
        throw new BadRequestException('Each data row can only be updated once');
      }
      seen.add(change.id);
    }

    await this.requireTask(taskId);
    const columns = await this.loadColumns(taskId);
    const rows: MergeTaskData[] = [];
    for (const change of changes) {
      rows.push(await this.requireDataRow(taskId, change.id));
    }

    const { primary, index } = await this.primaryIndex(
      taskId,
      columns,
      new Set(changes.map((change) => change.id)),
    );
    const failures: Array<{ id: string; remainingProblems: FieldError[] }> =
      [];
    const ready: Array<{ row: MergeTaskData; data: Record<string, unknown> }> =
      [];

    changes.forEach((change, position) => {
      const row = rows[position];
      this.assertKnownColumnKeys(columns, change.values);
      if (Object.keys(change.values).length === 0) {
        throw new BadRequestException('Provide at least one value to update');
      }
      const result = validateMappedRow(
        columns,
        { ...row.data, ...change.values },
        row.originalData,
      );
      this.applyPrimaryCheck(
        primary,
        index,
        result,
        single ? 'file' : 'request',
      );
      if (!result.valid) {
        failures.push({ id: row.id, remainingProblems: result.fieldErrors });
        return;
      }
      ready.push({ row, data: result.data });
    });

    if (failures.length > 0) {
      if (single) {
        throw new BadRequestException({
          message: 'Row still has invalid values',
          remainingProblems: failures[0].remainingProblems,
        });
      }
      throw new BadRequestException({
        message: 'Some rows still have invalid values',
        rows: failures,
      });
    }

    for (const item of ready) {
      item.row.data = item.data;
    }
    await this.data.save(ready.map((item) => item.row));
    return ready.map((item) => this.toDataRow(item.row, columns));
  }

  private async deleteDataRows(taskId: string, ids: string[]) {
    const unique = [...new Set(ids)];
    if (unique.length === 0) {
      throw new BadRequestException('Choose at least one data row to delete');
    }
    if (unique.length > BULK_DATA_LIMIT) {
      throw new BadRequestException(
        `Delete at most ${BULK_DATA_LIMIT} rows at once`,
      );
    }

    await this.requireTask(taskId);
    const rows: MergeTaskData[] = [];
    for (const id of unique) {
      rows.push(await this.requireDataRow(taskId, id));
    }

    const removedByFile = new Map<string, number>();
    for (const row of rows) {
      await this.data.delete({ id: row.id, taskId });
      if (row.fileId) {
        removedByFile.set(row.fileId, (removedByFile.get(row.fileId) ?? 0) + 1);
      }
    }
    for (const [fileId, count] of removedByFile) {
      await this.files.decrement({ id: fileId }, 'validCount', count);
    }
    return rows.length;
  }

  private entityOrder(
    sort: string | undefined,
    order: ListSortOrder | undefined,
    allowed: readonly string[],
    fallback: Record<string, 'ASC' | 'DESC'>,
  ): Record<string, 'ASC' | 'DESC'> {
    this.assertSortRequest(sort, order);
    if (!sort) {
      return fallback;
    }
    if (!allowed.includes(sort)) {
      throw new BadRequestException(`Unknown sort column "${sort}"`);
    }
    return { [sort]: this.sortDirection(order) };
  }

  private valueOrder(
    jsonColumn: 'data' | 'mappedData',
    columns: Array<{ key: string; dataType: TaskColumnDataType }>,
    sort: string | undefined,
    order: ListSortOrder | undefined,
    fallback: Array<{ expression: string; direction: 'ASC' | 'DESC' }>,
    meta: readonly string[],
  ): Array<{ expression: string; direction: 'ASC' | 'DESC' }> {
    this.assertSortRequest(sort, order);
    if (!sort) {
      return fallback;
    }
    const direction = this.sortDirection(order);
    const column = columns.find((item) => item.key === sort);
    let expression: string;
    if (column) {
      this.assertSortKey(column.key);
      expression = this.columnSortExpression(jsonColumn, column);
    } else if (meta.includes(sort)) {
      expression = sort === 'fileName' ? 'file.fileName' : `row.${sort}`;
    } else {
      throw new BadRequestException(`Unknown sort column "${sort}"`);
    }
    return [
      { expression, direction },
      { expression: 'row.createdAt', direction: 'ASC' },
      { expression: 'row.id', direction: 'ASC' },
    ];
  }

  private columnSortExpression(
    jsonColumn: 'data' | 'mappedData',
    column: { key: string; dataType: TaskColumnDataType },
  ) {
    const text = `btrim(row.${jsonColumn} ->> '${column.key}')`;
    if (
      column.dataType === TaskColumnDataType.NUMBER ||
      column.dataType === TaskColumnDataType.INTEGER
    ) {
      return `CASE WHEN ${text} ~ '^-?[0-9]+(\\.[0-9]+)?$' THEN ${text}::numeric END`;
    }
    return `row.${jsonColumn} ->> '${column.key}'`;
  }

  private applyOrder(
    qb: {
      addSelect(selection: string, selectionAliasName: string): unknown;
      orderBy(
        sort: string,
        order?: 'ASC' | 'DESC',
        nulls?: 'NULLS LAST',
      ): unknown;
      addOrderBy(
        sort: string,
        order?: 'ASC' | 'DESC',
        nulls?: 'NULLS LAST',
      ): unknown;
    },
    orders: Array<{ expression: string; direction: 'ASC' | 'DESC' }>,
  ) {
    orders.forEach((item, index) => {
      // skip/take with a join makes TypeORM split ORDER BY on the first dot.
      // JSON expressions are not `alias.column`, so sort them through a select alias.
      const expression = /^[A-Za-z_][A-Za-z0-9_]*\.[A-Za-z_][A-Za-z0-9_]*$/.test(
        item.expression,
      )
        ? item.expression
        : this.selectSortValue(qb, item.expression, index);
      if (index === 0) {
        qb.orderBy(expression, item.direction, 'NULLS LAST');
      } else {
        qb.addOrderBy(expression, item.direction, 'NULLS LAST');
      }
    });
  }

  private selectSortValue(
    qb: { addSelect(selection: string, selectionAliasName: string): unknown },
    expression: string,
    index: number,
  ) {
    const alias = `sort_value_${index}`;
    qb.addSelect(expression, alias);
    return alias;
  }

  private assertSortRequest(sort?: string, order?: ListSortOrder) {
    if (order && !sort) {
      throw new BadRequestException('Choose a column to sort');
    }
  }

  private sortDirection(order?: ListSortOrder): 'ASC' | 'DESC' {
    return order === ListSortOrder.DESC ? 'DESC' : 'ASC';
  }

  private assertSortKey(key: string) {
    if (!/^[a-z][a-z0-9_]*$/.test(key)) {
      throw new BadRequestException(`Cannot sort by "${key}"`);
    }
  }

  private toDataRow(row: MergeTaskData, columns: Array<{ key: string }>) {
    return {
      id: row.id,
      fileId: row.fileId,
      fileName: row.file?.fileName ?? null,
      sourceRowNumber: row.sourceRowNumber,
      values: this.projectOutputValues(
        columns.map((column) => column.key),
        row.data,
      ),
      originalValues: row.originalData,
      createdAt: row.createdAt,
    };
  }

  private projectOutputValues(
    columnKeys: string[],
    data: Record<string, unknown> | null | undefined,
  ): Record<string, unknown> {
    const values: Record<string, unknown> = {};
    for (const key of columnKeys) {
      const value = data?.[key];
      values[key] = value === undefined ? null : value;
    }
    return values;
  }

  private async requireTask(taskId: string): Promise<MergeTask> {
    const task = await this.tasks.findOne({ where: { id: taskId } });
    if (!task) {
      throw new NotFoundException('Task not found');
    }
    return task;
  }

  private async requireColumn(taskId: string, columnId: string) {
    const column = await this.columns.findOne({
      where: { id: columnId, taskId },
    });
    if (!column) {
      throw new NotFoundException('Column not found');
    }
    return column;
  }

  private async requireFile(
    taskId: string,
    fileId: string,
    withData = false,
  ): Promise<MergeUploadedFile> {
    const qb = this.files
      .createQueryBuilder('file')
      .where('file.id = :fileId', { fileId })
      .andWhere('file.task_id = :taskId', { taskId });
    if (withData) {
      qb.addSelect('file.fileData');
    }
    const file = await qb.getOne();
    if (!file) {
      throw new NotFoundException('Uploaded file not found');
    }
    if (withData) {
      if (!file.fileData || !isXlsxZip(file.fileData)) {
        throw new BadRequestException(
          'Original Excel file is no longer available. Please re-upload the file.',
        );
      }
      file.fileData = toExcelBuffer(file.fileData);
    }
    return file;
  }

  private isExcel(file: Express.Multer.File): boolean {
    const name = file.originalname.toLowerCase();
    return name.endsWith('.xlsx');
  }

  private async summaryForExport(
    task: MergeTask,
    columns: MergeTaskColumn[],
    query: ExportTaskDataQueryDto,
  ): Promise<TaskSummaryConfig | null> {
    const current = task.summaryConfig ?? null;
    const sent =
      query.rowColumn !== undefined ||
      query.columnColumn !== undefined ||
      query.totalLabel !== undefined;
    if (!sent) {
      return current;
    }
    const rowColumn = query.rowColumn ?? current?.rowColumn;
    const columnColumn = query.columnColumn ?? current?.columnColumn;
    const totalLabel = (query.totalLabel ?? current?.totalLabel)?.trim();
    if (!rowColumn || !columnColumn || !totalLabel) {
      throw new BadRequestException(
        'Send rowColumn, columnColumn, and totalLabel',
      );
    }
    const summary = this.checkedSummary(columns, {
      rowColumn,
      columnColumn,
      totalLabel,
      metrics: current?.metrics ?? [],
    });
    task.summaryConfig = summary;
    await this.tasks.save(task);
    return summary;
  }

  private checkedSummary(
    columns: MergeTaskColumn[],
    summary: TaskSummaryConfig,
  ): TaskSummaryConfig {
    if (summary.rowColumn === summary.columnColumn) {
      throw new BadRequestException(
        'Choose two different columns for the summary blocks and headers',
      );
    }
    this.assertSummaryColumn(columns, summary.rowColumn);
    this.assertSummaryColumn(columns, summary.columnColumn);
    if (!summary.totalLabel.trim()) {
      throw new BadRequestException('Summary total label cannot be empty');
    }
    for (const metric of summary.metrics) {
      if (!metric.label.trim()) {
        throw new BadRequestException('Summary row label cannot be empty');
      }
      if (metric.op === 'sum') {
        const column = this.assertSummaryColumn(columns, metric.column);
        if (
          column.dataType !== TaskColumnDataType.NUMBER &&
          column.dataType !== TaskColumnDataType.INTEGER
        ) {
          throw new BadRequestException(
            `${column.label} must be a number column to add`,
          );
        }
      }
      for (const filter of metric.when ?? []) {
        this.assertSummaryColumn(columns, filter.column);
        if (
          typeof filter.equals !== 'string' &&
          typeof filter.equals !== 'number' &&
          typeof filter.equals !== 'boolean'
        ) {
          throw new BadRequestException(
            'A summary filter equals a text, number, or yes/no value',
          );
        }
        if (typeof filter.equals === 'number' && !Number.isFinite(filter.equals)) {
          throw new BadRequestException(
            'A summary filter equals a text, number, or yes/no value',
          );
        }
      }
    }
    return {
      rowColumn: summary.rowColumn,
      columnColumn: summary.columnColumn,
      totalLabel: summary.totalLabel.trim(),
      metrics: summary.metrics.map((metric) => {
        const saved: SummaryMetric = {
          label: metric.label.trim(),
          op: metric.op,
        };
        if (metric.op === 'sum' && metric.column) {
          saved.column = metric.column;
        }
        if (metric.when?.length) {
          saved.when = metric.when;
        }
        return saved;
      }),
    };
  }

  private assertSummaryColumn(
    columns: MergeTaskColumn[],
    key: string | undefined,
  ): MergeTaskColumn {
    const column = columns.find((item) => item.key === key);
    if (!column) {
      throw new BadRequestException(
        key
          ? `Unknown output column "${key}"`
          : 'Choose a number column to add',
      );
    }
    return column;
  }

  private writeSummarySheet(
    workbook: ExcelJS.Workbook,
    rows: MergeTaskData[],
    summary: TaskSummaryConfig,
  ) {
    const sheet = workbook.addWorksheet('Summary');
    sheet.getColumn(1).width = 3;
    const blocks = this.summaryBlocks(rows, summary);
    blocks.forEach((block, index) => {
      const header = sheet.addRow([
        null,
        block.rowValue,
        summary.totalLabel,
        ...block.groups,
      ]);
      this.paintSummaryRow(header, block.groups.length, 'header');
      for (const metric of block.metrics) {
        const line = sheet.addRow([
          null,
          metric.label,
          metric.total,
          ...metric.values,
        ]);
        this.paintSummaryRow(line, block.groups.length, 'metric');
      }
      if (index < blocks.length - 1) {
        sheet.addRow([]);
      }
    });
    this.fitColumns(sheet, 2);
  }

  private summaryBlocks(rows: MergeTaskData[], summary: TaskSummaryConfig) {
    const rowOrder: string[] = [];
    const groupsByRow = new Map<string, string[]>();
    const rowsByGroup = new Map<string, Map<string, MergeTaskData[]>>();
    for (const row of rows) {
      const rowValue = this.summaryText(row.data?.[summary.rowColumn]);
      const columnValue = this.summaryText(row.data?.[summary.columnColumn]);
      if (!rowValue || !columnValue) {
        continue;
      }
      if (!rowsByGroup.has(rowValue)) {
        rowOrder.push(rowValue);
        rowsByGroup.set(rowValue, new Map());
        groupsByRow.set(rowValue, []);
      }
      const groups = rowsByGroup.get(rowValue)!;
      if (!groups.has(columnValue)) {
        groupsByRow.get(rowValue)!.push(columnValue);
        groups.set(columnValue, []);
      }
      groups.get(columnValue)!.push(row);
    }

    return rowOrder.map((rowValue) => {
      const groups = [...(groupsByRow.get(rowValue) ?? [])].sort((left, right) =>
        left.localeCompare(right, undefined, {
          numeric: true,
          sensitivity: 'base',
        }),
      );
      const byGroup = rowsByGroup.get(rowValue)!;
      return {
        rowValue,
        groups,
        metrics: summary.metrics.map((metric) => {
          const values = groups.map((group) =>
            this.summarizeMetric(byGroup.get(group) ?? [], metric),
          );
          return {
            label: metric.label,
            values,
            total: values.reduce((sum, value) => sum + value, 0),
          };
        }),
      };
    });
  }

  private summarizeMetric(rows: MergeTaskData[], metric: SummaryMetric): number {
    const matched = rows.filter((row) =>
      (metric.when ?? []).every((filter) =>
        this.summaryEquals(row.data?.[filter.column], filter.equals),
      ),
    );
    if (metric.op === 'count') {
      return matched.length;
    }
    return matched.reduce(
      (sum, row) => sum + this.summaryNumber(row.data?.[metric.column!]),
      0,
    );
  }

  private summaryText(value: unknown): string | null {
    if (value === null || value === undefined) {
      return null;
    }
    const text = String(value).trim();
    return text ? text : null;
  }

  private summaryEquals(value: unknown, expected: string | number | boolean) {
    if (typeof expected === 'number') {
      if (typeof value === 'number' && Number.isFinite(value)) {
        return value === expected;
      }
      const text = this.summaryText(value)?.replace(/,/g, '');
      if (!text || !/^-?[0-9]+(\.[0-9]+)?$/.test(text)) {
        return false;
      }
      return Number(text) === expected;
    }
    if (typeof expected === 'boolean') {
      return value === expected;
    }
    return this.summaryText(value) === expected.trim();
  }

  private summaryNumber(value: unknown): number {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
    if (value === null || value === undefined || value === '') {
      return 0;
    }
    const parsed = Number(String(value).trim().replace(/,/g, ''));
    return Number.isFinite(parsed) ? parsed : 0;
  }

  private exportCell(value: unknown): string | number | boolean | Date | null {
    if (value === null || value === undefined) {
      return null;
    }
    if (
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean'
    ) {
      return value;
    }
    return String(value);
  }

  private paintTable(sheet: ExcelJS.Worksheet) {
    const columnCount = sheet.columnCount;
    const rowCount = sheet.rowCount;
    if (columnCount === 0 || rowCount === 0) {
      return;
    }
    sheet.views = [{ state: 'frozen', ySplit: 1 }];
    sheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: columnCount },
    };
    for (let rowNumber = 1; rowNumber <= rowCount; rowNumber += 1) {
      const row = sheet.getRow(rowNumber);
      const header = rowNumber === 1;
      row.height = header ? 22 : 18;
      for (let column = 1; column <= columnCount; column += 1) {
        const cell = row.getCell(column);
        cell.border = this.cellBorder();
        cell.alignment = {
          vertical: 'middle',
          horizontal:
            header || typeof cell.value === 'number' ? 'center' : 'left',
          wrapText: header,
        };
        if (header) {
          cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
          cell.fill = this.solidFill('FF5C2D4A');
        } else if (rowNumber % 2 === 0) {
          cell.fill = this.solidFill('FFF8F1F4');
        }
      }
    }
    this.fitColumns(sheet, 1);
  }

  private paintSummaryRow(
    row: ExcelJS.Row,
    groupCount: number,
    kind: 'header' | 'metric',
  ) {
    row.height = 20;
    const lastColumn = 3 + groupCount;
    for (let column = 2; column <= lastColumn; column += 1) {
      const cell = row.getCell(column);
      cell.border = this.cellBorder();
      cell.alignment = {
        vertical: 'middle',
        horizontal: column === 2 && kind === 'metric' ? 'left' : 'center',
        wrapText: true,
      };
      if (kind === 'header') {
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = this.solidFill('FF5C2D4A');
      } else if (column === 2) {
        cell.font = { bold: true, color: { argb: 'FF3D2A24' } };
        cell.fill = this.solidFill('FFF6D7B8');
      } else if (column === 3) {
        cell.font = { bold: true, color: { argb: 'FF3D2A24' } };
        cell.fill = this.solidFill('FFE4C6DE');
      } else {
        cell.fill = this.solidFill('FFF7F0F8');
      }
    }
  }

  private cellBorder(): Partial<ExcelJS.Borders> {
    const edge: ExcelJS.Border = { style: 'thin', color: { argb: 'FFD9C9CF' } };
    return { top: edge, left: edge, bottom: edge, right: edge };
  }

  private solidFill(argb: string): ExcelJS.Fill {
    return { type: 'pattern', pattern: 'solid', fgColor: { argb } };
  }

  private fitColumns(sheet: ExcelJS.Worksheet, fromColumn: number) {
    const lastRow = Math.min(sheet.rowCount, 200);
    for (let column = fromColumn; column <= sheet.columnCount; column += 1) {
      let width = 12;
      for (let rowNumber = 1; rowNumber <= lastRow; rowNumber += 1) {
        const value = sheet.getRow(rowNumber).getCell(column).value;
        const length =
          value === null || value === undefined ? 0 : String(value).length;
        width = Math.max(width, Math.min(length + 3, 42));
      }
      sheet.getColumn(column).width = width;
    }
  }

  private safeFileName(name: string): string {
    return name.replace(/[^\w.-]+/g, '_').slice(0, 80) || 'task';
  }
}
