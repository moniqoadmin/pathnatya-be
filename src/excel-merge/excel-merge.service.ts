import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as ExcelJS from 'exceljs';
import { FindOptionsWhere, Repository } from 'typeorm';
import { ExcelAnalyzerService } from './excel-analyzer.service';
import {
  cellToString,
  normalizeHeader,
  toColumnKey,
  unexpectedHeaders,
} from './excel-cell.util';
import { isXlsxZip, toExcelBuffer } from './excel-buffer.util';
import {
  ConfirmMappingDto,
  CreateMergeTaskDto,
  CreateTaskColumnDto,
  UpdateMergeTaskDto,
  UpdateTaskColumnDto,
  UpdateTaskErrorDto,
} from './dto/excel-merge.dto';
import {
  ListMergeFilesQueryDto,
  ListMergeTasksQueryDto,
  ListTaskDataQueryDto,
  ListTaskErrorsQueryDto,
} from './dto/list-excel-merge-query.dto';
import { MergeTaskColumn } from './entities/task-column.entity';
import { MergeTaskData } from './entities/task-data.entity';
import { MergeTaskError } from './entities/task-error.entity';
import { MergeTask } from './entities/merge-task.entity';
import { MergeUploadedFile } from './entities/uploaded-file.entity';
import { validateMappedRow } from './excel-row.validator';
import {
  DetectedColumn,
  FileColumnMapping,
  MergeErrorStatus,
  MergeFileStatus,
  SavedColumnMapping,
  SuggestedMapping,
  TaskColumnDataType,
} from './excel-merge.types';

const FILE_BATCH = 500;

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
      order: { createdAt: 'DESC' },
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
    };
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
    const task = await this.requireTask(taskId);
    this.assertSchemaUnlocked(task, 'add columns');
    const existing = await this.columns.find({ where: { taskId } });
    const used = new Set(existing.map((column) => column.key));
    let sortOrder =
      existing.reduce((max, column) => Math.max(max, column.sortOrder), -1) + 1;

    const created = dtos.map((dto) => {
      const label = dto.label.trim();
      if (!label) {
        throw new BadRequestException('Column label cannot be empty');
      }
      const column = this.columns.create({
        taskId,
        key: toColumnKey(label, used),
        label,
        dataType: dto.dataType ?? TaskColumnDataType.STRING,
        required: dto.required ?? false,
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
      const task = await this.requireTask(taskId);
      if (this.isSchemaFrozen(task)) {
        throw new BadRequestException(
          'Column names are frozen from the first uploaded file and cannot be renamed',
        );
      }
      column.label = dto.label.trim();
    }
    if (dto.dataType !== undefined) {
      column.dataType = dto.dataType;
    }
    if (dto.required !== undefined) {
      column.required = dto.required;
    }
    if (dto.sortOrder !== undefined) {
      column.sortOrder = dto.sortOrder;
    }
    await this.columns.save(column);
    return this.toColumn(column);
  }

  async deleteColumn(taskId: string, columnId: string) {
    const task = await this.requireTask(taskId);
    this.assertSchemaUnlocked(task, 'remove columns');
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
      order: { createdAt: 'DESC' },
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

    await this.enforceFrozenHeaders(
      task,
      file.analysis.columns.map((column) => column.header),
      file,
    );

    const detectedHeaders = new Set(
      file.analysis.columns.map((column) => column.header),
    );
    for (const mapping of dto.mappings) {
      if (!detectedHeaders.has(mapping.sourceHeader)) {
        throw new BadRequestException(
          `Uploaded file has no column named "${mapping.sourceHeader}"`,
        );
      }
    }

    let columns = await this.columns.find({ where: { taskId } });
    const usedKeys = new Set(columns.map((column) => column.key));
    let nextOrder =
      columns.reduce((max, column) => Math.max(max, column.sortOrder), -1) + 1;

    const resolved: FileColumnMapping[] = [];
    const learned: Record<string, SavedColumnMapping> = {
      ...task.columnMappings,
    };

    for (const mapping of dto.mappings) {
      const detected = file.analysis.columns.find(
        (column) => column.header === mapping.sourceHeader,
      );
      if (!detected) {
        continue;
      }

      if (mapping.action === 'ignore') {
        const item: FileColumnMapping = {
          sourceHeader: mapping.sourceHeader,
          sourceIndex: detected.index,
          action: 'ignore',
          columnKey: null,
        };
        resolved.push(item);
        learned[normalizeHeader(mapping.sourceHeader)] = {
          sourceHeader: mapping.sourceHeader,
          action: 'ignore',
          columnKey: null,
        };
        continue;
      }

      let columnKey = mapping.columnKey ?? null;
      if (mapping.action === 'create') {
        this.assertSchemaUnlocked(task, 'add a new master column from mapping');
        const label = mapping.label?.trim() || mapping.sourceHeader;
        const created = await this.columns.save(
          this.columns.create({
            taskId,
            key: toColumnKey(label, usedKeys),
            label,
            dataType: mapping.dataType ?? detected.inferredType,
            required: mapping.required ?? false,
            sortOrder: nextOrder,
          }),
        );
        nextOrder += 1;
        columnKey = created.key;
        columns = [...columns, created];
      }

      if (!columnKey) {
        throw new BadRequestException(
          `Mapping for "${mapping.sourceHeader}" needs a master column`,
        );
      }
      const master = columns.find((column) => column.key === columnKey);
      if (!master) {
        throw new BadRequestException(
          `Unknown master column "${columnKey}" for "${mapping.sourceHeader}"`,
        );
      }

      const item: FileColumnMapping = {
        sourceHeader: mapping.sourceHeader,
        sourceIndex: detected.index,
        action: 'map',
        columnKey,
      };
      resolved.push(item);
      learned[normalizeHeader(mapping.sourceHeader)] = {
        sourceHeader: mapping.sourceHeader,
        action: 'map',
        columnKey,
      };
    }

    const mappedKeys = resolved
      .filter((item) => item.action === 'map')
      .map((item) => item.columnKey);
    if (new Set(mappedKeys).size !== mappedKeys.length) {
      throw new BadRequestException(
        'Two uploaded columns cannot map to the same master column',
      );
    }

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

    task.columnMappings = learned;
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
        'Add at least one master column before processing',
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
    const where: FindOptionsWhere<MergeTaskData> = { taskId };
    if (query.fileId) {
      where.fileId = query.fileId;
    }
    const [rows, total] = await this.data.findAndCount({
      where,
      relations: { file: true },
      order: { createdAt: 'ASC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    const columns = await this.listColumns(taskId);
    return {
      columns,
      data: rows.map((row) => ({
        id: row.id,
        fileId: row.fileId,
        fileName: row.file?.fileName ?? null,
        sourceRowNumber: row.sourceRowNumber,
        values: row.data,
        originalValues: row.originalData,
        createdAt: row.createdAt,
      })),
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }

  async listErrors(taskId: string, query: ListTaskErrorsQueryDto) {
    await this.requireTask(taskId);
    const page = query.page ?? 1;
    const limit = query.limit ?? 50;
    const where: FindOptionsWhere<MergeTaskError> = { taskId };
    where.status = query.status ?? MergeErrorStatus.PENDING;
    if (query.fileId) {
      where.fileId = query.fileId;
    }
    const [rows, total] = await this.errors.findAndCount({
      where,
      relations: { file: true },
      order: { sourceRowNumber: 'ASC', createdAt: 'ASC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    const columns = await this.columns.find({
      where: { taskId },
      order: { sortOrder: 'ASC' },
    });
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

  async exportMaster(taskId: string): Promise<{
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
        'This task has no master columns to export',
      );
    }

    const rows = await this.data.find({
      where: { taskId },
      order: { createdAt: 'ASC' },
    });

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Master');
    sheet.addRow(columns.map((column) => column.label));
    for (const row of rows) {
      sheet.addRow(
        columns.map((column) => this.exportCell(row.data[column.key])),
      );
    }
    this.styleHeader(sheet);

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
      sheet.addRow([
        row.file?.fileName ?? row.fileId,
        row.sourceRowNumber,
        ...columns.map((column) => this.exportCell(row.mappedData[column.key])),
        row.fieldErrors
          .map((error) => `${error.label}: ${error.message}`)
          .join('; '),
      ]);
    }
    this.styleHeader(sheet);

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
      const task = await this.requireTask(taskId);
      saved.analysis = analysis;
      await this.enforceFrozenHeaders(
        task,
        analysis.columns.map((column) => column.header),
        saved,
      );

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
    return detected.map((column) => {
      const saved = task.columnMappings[normalizeHeader(column.header)];
      if (saved) {
        const master = columns.find((item) => item.key === saved.columnKey);
        return {
          sourceHeader: column.header,
          sourceIndex: column.index,
          action: saved.action,
          columnKey: saved.columnKey,
          columnLabel: master?.label ?? null,
          reason: 'saved' as const,
        };
      }

      const normalized = normalizeHeader(column.header);
      const nameMatch = columns.find(
        (item) =>
          normalizeHeader(item.label) === normalized ||
          item.key === toColumnKey(column.header, new Set()),
      );
      if (nameMatch) {
        return {
          sourceHeader: column.header,
          sourceIndex: column.index,
          action: 'map',
          columnKey: nameMatch.key,
          columnLabel: nameMatch.label,
          reason: 'name_match' as const,
        };
      }

      return {
        sourceHeader: column.header,
        sourceIndex: column.index,
        action: 'unmapped',
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
    const errorByKey = new Map(
      row.fieldErrors.map((error) => [error.columnKey, error]),
    );
    return {
      id: row.id,
      fileId: row.fileId,
      fileName: row.file?.fileName ?? null,
      sourceRowNumber: row.sourceRowNumber,
      status: row.status,
      originalValues: row.originalData,
      fields: columns.map((column) => {
        const error = errorByKey.get(column.key);
        const currentValue = row.mappedData[column.key] ?? null;
        return {
          columnKey: column.key,
          label: column.label,
          dataType: column.dataType,
          required: column.required,
          currentValue,
          originalValue: error?.originalValue ?? currentValue,
          valid: row.status === MergeErrorStatus.RESOLVED ? true : !error,
          message: error?.message ?? null,
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
      frozenHeaders: task.frozenHeaders ?? [],
      schemaFrozen: this.isSchemaFrozen(task),
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

  private isSchemaFrozen(task: MergeTask): boolean {
    return (task.frozenHeaders?.length ?? 0) > 0;
  }

  private assertSchemaUnlocked(task: MergeTask, action: string) {
    if (this.isSchemaFrozen(task)) {
      throw new BadRequestException(
        `Column names are frozen from the first uploaded file. You cannot ${action}.`,
      );
    }
  }

  private async enforceFrozenHeaders(
    task: MergeTask,
    detectedHeaders: string[],
    file: MergeUploadedFile,
  ) {
    const headers = detectedHeaders
      .map((header) => header.trim())
      .filter(Boolean);
    if (headers.length === 0) {
      return;
    }

    if (!this.isSchemaFrozen(task)) {
      task.frozenHeaders = headers;
      await this.tasks.save(task);
      await this.seedColumnsFromFirstFile(task.id, file);
      return;
    }

    const extra = unexpectedHeaders(task.frozenHeaders, headers);
    if (extra.length === 0) {
      return;
    }

    throw new BadRequestException(
      `This task's column names are frozen from the first uploaded file. Unexpected column(s): ${extra.join(', ')}. Expected: ${task.frozenHeaders.join(', ')}.`,
    );
  }

  private async seedColumnsFromFirstFile(
    taskId: string,
    file: MergeUploadedFile,
  ) {
    const detected = file.analysis?.columns ?? [];
    if (detected.length === 0) {
      return;
    }

    const existing = await this.columns.find({ where: { taskId } });
    const used = new Set(existing.map((column) => column.key));
    const existingNames = new Set(
      existing.map((column) => normalizeHeader(column.label)),
    );
    let sortOrder =
      existing.reduce((max, column) => Math.max(max, column.sortOrder), -1) + 1;

    const created = detected
      .filter((column) => {
        const normalized = normalizeHeader(column.header);
        if (!normalized || existingNames.has(normalized)) {
          return false;
        }
        existingNames.add(normalized);
        return true;
      })
      .map((column) => {
        const entity = this.columns.create({
          taskId,
          key: toColumnKey(column.header, used),
          label: column.header,
          dataType: column.inferredType,
          required: false,
          sortOrder,
        });
        sortOrder += 1;
        return entity;
      });

    if (created.length) {
      await this.columns.save(created);
    }
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

  private styleHeader(sheet: ExcelJS.Worksheet) {
    const header = sheet.getRow(1);
    header.font = { bold: true };
    header.commit();
  }

  private safeFileName(name: string): string {
    return name.replace(/[^\w.-]+/g, '_').slice(0, 80) || 'task';
  }
}
