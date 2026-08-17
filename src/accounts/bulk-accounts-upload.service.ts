import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';
import * as ExcelJS from 'exceljs';
import { Account, AccountRole, AccountStatus } from './entities/account.entity';
import {
  COUNTRY_CODE_TO_NAME,
  TEMPLATE_COLUMNS,
  normalizeHeader,
} from './accounts.template';
import { isSupportedPhoneNumber } from './validators/supported-phone-number.validator';

export interface BulkUploadError {
  row: number;
  sn: string | null;
  country: string | null;
  sanghat: string | null;
  jilha: string | null;
  taluka: string | null;
  group: string | null;
  kendra: string | null;
  sanchalakName: string | null;
  phoneNumber: string | null;
  error: string;
}

export interface BulkUploadResult {
  totalRows: number;
  created: number;
  failed: number;
  errors: BulkUploadError[];
}

type PendingAccount = {
  rowNumber: number;
  values: Record<string, string>;
  account: Account;
};

@Injectable()
export class BulkAccountsUploadService {
  private static readonly BATCH_SIZE = 500;

  constructor(
    @InjectRepository(Account)
    private readonly accountsRepository: Repository<Account>,
  ) {}

  async bulkUpload(
    buffer: Buffer,
    onProgress?: (result: BulkUploadResult) => Promise<void>,
  ): Promise<BulkUploadResult> {
    const workbook = new ExcelJS.Workbook();
    try {
      await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
    } catch {
      throw new BadRequestException('Could not read the uploaded Excel file');
    }

    const { sheet, headerRowNumber, fieldToColumn } =
      this.findUploadSheet(workbook);

    const existingAccounts = await this.accountsRepository.find({
      select: ['phoneNumber'],
    });
    const existingPhones = new Set(
      existingAccounts.map((account) => account.phoneNumber),
    );

    const result: BulkUploadResult = {
      totalRows: 0,
      created: 0,
      failed: 0,
      errors: [],
    };

    const pending: PendingAccount[] = [];

    for (
      let rowNumber = headerRowNumber + 1;
      rowNumber <= sheet.rowCount;
      rowNumber++
    ) {
      const row = sheet.getRow(rowNumber);
      const values = TEMPLATE_COLUMNS.reduce<Record<string, string>>(
        (acc, column) => {
          const colIndex = fieldToColumn.get(column.field);
          acc[column.field] = colIndex
            ? this.cellToString(row.getCell(colIndex).value)
            : '';
          return acc;
        },
        {},
      );

      if (Object.values(values).every((value) => value === '')) {
        continue;
      }

      result.totalRows += 1;

      try {
        const account = this.buildAccountFromRow(values, existingPhones);
        existingPhones.add(account.phoneNumber);
        pending.push({ rowNumber, values, account });
      } catch (error) {
        result.failed += 1;
        result.errors.push(
          this.buildRowError(rowNumber, values, this.toErrorMessage(error)),
        );
      }
    }

    for (
      let start = 0;
      start < pending.length;
      start += BulkAccountsUploadService.BATCH_SIZE
    ) {
      const batch = pending.slice(
        start,
        start + BulkAccountsUploadService.BATCH_SIZE,
      );
      await this.insertBatch(batch, result);
      await onProgress?.({ ...result, errors: [] });
    }

    return result;
  }

  private async insertBatch(
    batch: PendingAccount[],
    result: BulkUploadResult,
  ): Promise<void> {
    if (batch.length === 0) {
      return;
    }

    try {
      await this.accountsRepository.insert(
        batch.map((item) => item.account as QueryDeepPartialEntity<Account>),
      );
      result.created += batch.length;
    } catch (error) {
      if (!this.isUniqueViolation(error)) {
        throw error;
      }

      // A concurrent upload may insert a phone number after our initial
      // duplicate lookup. Only in that rare case, fall back to per-row inserts
      // so one duplicate does not fail the entire batch.
      for (const item of batch) {
        try {
          await this.accountsRepository.insert(
            item.account as QueryDeepPartialEntity<Account>,
          );
          result.created += 1;
        } catch (rowError) {
          result.failed += 1;
          result.errors.push(
            this.buildRowError(
              item.rowNumber,
              item.values,
              this.isUniqueViolation(rowError)
                ? 'number already exists'
                : this.toErrorMessage(rowError),
            ),
          );
        }
      }
    }
  }

  private buildAccountFromRow(
    values: Record<string, string>,
    existingPhones: Set<string>,
  ): Account {
    const phoneNumber = this.normalizePhone(values.phoneNumber);
    if (!phoneNumber) {
      throw new Error('Mobile Number is missing');
    }
    if (!isSupportedPhoneNumber(phoneNumber)) {
      throw new Error('phone number is not 10 digits');
    }
    if (existingPhones.has(phoneNumber)) {
      throw new Error('number already exists');
    }

    const role = values.role?.trim();
    if (role && !Object.values(AccountRole).includes(role as AccountRole)) {
      throw new Error(
        `role must be one of: ${Object.values(AccountRole).join(', ')}`,
      );
    }

    const country = this.resolveCountry(values);
    const numberOfTeams = this.parseOptionalPositiveInt(
      values.numberOfTeams,
      'No. of Teams Expected',
    );
    const kendraType = values.kendraType?.trim();

    return this.accountsRepository.create({
      phoneNumber,
      passwordHash: null,
      setPassword: true,
      status: AccountStatus.ACTIVE,
      role: (role as AccountRole) || AccountRole.USER,
      isOffline: false,
      isLoginDisabled: false,
      domSecurity: true,
      chokidar: true,
      country: country ?? null,
      sanghat: values.sanghat?.trim() || null,
      jilha: values.jilha?.trim() || null,
      taluka: values.taluka?.trim() || null,
      group: values.group?.trim() || null,
      kendra: values.kendra?.trim() || null,
      sanchalakName: values.sanchalakName?.trim() || null,
      numberOfTeams: numberOfTeams ?? null,
      numberOfReboot: 0,
      videoOnly: false,
      metadata: kendraType ? { kendraType } : null,
      ipAddress: null,
      systemAddress: null,
      lastLoginTime: null,
    });
  }

  private findUploadSheet(workbook: ExcelJS.Workbook): {
    sheet: ExcelJS.Worksheet;
    headerRowNumber: number;
    fieldToColumn: Map<string, number>;
  } {
    if (workbook.worksheets.length === 0) {
      throw new BadRequestException('The uploaded Excel file has no sheets');
    }

    let best:
      | {
          sheet: ExcelJS.Worksheet;
          headerRowNumber: number;
          fieldToColumn: Map<string, number>;
          score: number;
        }
      | undefined;

    for (const sheet of workbook.worksheets) {
      const scanLimit = Math.min(40, sheet.rowCount);
      for (let rowNumber = 1; rowNumber <= scanLimit; rowNumber++) {
        const fieldToColumn = this.resolveHeaderColumns(
          sheet.getRow(rowNumber),
        );
        if (!fieldToColumn.has('phoneNumber')) {
          continue;
        }

        const isKendraSheet = sheet.name.trim().toLowerCase() === 'kendra';
        const score = fieldToColumn.size + (isKendraSheet ? 100 : 0);
        if (!best || score > best.score) {
          best = { sheet, headerRowNumber: rowNumber, fieldToColumn, score };
        }
        break;
      }
    }

    if (!best) {
      throw new BadRequestException(
        'Could not find a sheet with a Mobile Number column',
      );
    }

    return best;
  }

  private resolveHeaderColumns(headerRow: ExcelJS.Row): Map<string, number> {
    const fieldToColumn = new Map<string, number>();

    headerRow.eachCell((cell, colNumber) => {
      const normalized = normalizeHeader(this.cellToString(cell.value));
      if (!normalized) {
        return;
      }

      let best:
        | {
            field: (typeof TEMPLATE_COLUMNS)[number]['field'];
            aliasLen: number;
          }
        | undefined;

      for (const column of TEMPLATE_COLUMNS) {
        const candidates = [
          normalizeHeader(column.header),
          ...column.aliases.map(normalizeHeader),
        ];
        for (const alias of candidates) {
          if (alias === normalized && (!best || alias.length > best.aliasLen)) {
            best = { field: column.field, aliasLen: alias.length };
          }
        }
      }

      if (best && !fieldToColumn.has(best.field)) {
        fieldToColumn.set(best.field, colNumber);
      }
    });

    return fieldToColumn;
  }

  private resolveCountry(values: Record<string, string>): string | undefined {
    const countryName = values.country?.trim();
    if (countryName) {
      return countryName;
    }

    const countryCode = values.countryCode?.trim().replace(/\.0$/, '');
    if (!countryCode) {
      return undefined;
    }

    const mapped = COUNTRY_CODE_TO_NAME[countryCode];
    if (!mapped) {
      throw new Error(
        `Country Code must be one of: ${Object.keys(COUNTRY_CODE_TO_NAME).join(', ')}`,
      );
    }
    return mapped;
  }

  private normalizePhone(raw: string | undefined): string {
    return (raw ?? '').trim().replace(/\.0$/, '');
  }

  private buildRowError(
    rowNumber: number,
    values: Record<string, string>,
    error: string,
  ): BulkUploadError {
    return {
      row: rowNumber,
      sn: values.sn?.trim() || null,
      country:
        values.country?.trim() || this.countryFromCode(values.countryCode),
      sanghat: values.sanghat?.trim() || null,
      jilha: values.jilha?.trim() || null,
      taluka: values.taluka?.trim() || null,
      group: values.group?.trim() || null,
      kendra: values.kendra?.trim() || null,
      sanchalakName: values.sanchalakName?.trim() || null,
      phoneNumber: this.normalizePhone(values.phoneNumber) || null,
      error,
    };
  }

  private countryFromCode(raw: string | undefined): string | null {
    const countryCode = raw?.trim().replace(/\.0$/, '');
    if (!countryCode) {
      return null;
    }
    return COUNTRY_CODE_TO_NAME[countryCode] ?? countryCode;
  }

  private parseOptionalPositiveInt(
    raw: string | undefined,
    fieldName: string,
  ): number | undefined {
    const value = raw?.trim().replace(/\.0$/, '');
    if (!value) {
      return undefined;
    }
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 1) {
      throw new Error(`${fieldName} must be an integer >= 1`);
    }
    return parsed;
  }

  private cellToString(value: ExcelJS.CellValue): string {
    if (value === null || value === undefined) {
      return '';
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
        return String(obj.result).trim();
      }
      return '';
    }
    return String(value).trim();
  }

  private isUniqueViolation(error: unknown): boolean {
    return (
      error instanceof QueryFailedError &&
      (error as QueryFailedError & { code?: string }).code === '23505'
    );
  }

  private toErrorMessage(error: unknown): string {
    if (this.isUniqueViolation(error)) {
      return 'number already exists';
    }
    if (error instanceof Error) {
      return error.message;
    }
    return 'Unknown error';
  }
}
