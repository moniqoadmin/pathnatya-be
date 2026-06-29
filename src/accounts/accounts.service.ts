import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as ExcelJS from 'exceljs';
import { Account, AccountStatus } from './entities/account.entity';
import { CreateAccountDto } from './dto/create-account.dto';
import { UpdateAccountDto } from './dto/update-account.dto';
import { LoginDto } from './dto/login.dto';
import { SetPasswordDto } from './dto/set-password.dto';
import { hashPassword, verifyPassword } from './password.util';
import { LOGIN_SUCCESS_TOKEN } from './accounts.constants';
import {
  TEMPLATE_COLUMNS,
  TEMPLATE_SHEET_NAME,
} from './accounts.template';
import { isSupportedPhoneNumber } from './validators/supported-phone-number.validator';

// Account without the sensitive passwordHash field, used in API responses.
export type AccountResponse = Omit<Account, 'passwordHash'>;

export interface LoginResponse {
  account: AccountResponse;
  token: string;
}

export interface CheckPhoneResult {
  exists: boolean;
  // True when the account exists but has not set a password yet,
  // i.e. the client should proceed to call set-password.
  needsPassword: boolean;
}

export interface BulkUploadError {
  row: number;
  phoneNumber: string | null;
  message: string;
}

export interface BulkUploadResult {
  totalRows: number;
  created: number;
  failed: number;
  errors: BulkUploadError[];
}

@Injectable()
export class AccountsService {
  constructor(
    @InjectRepository(Account)
    private readonly accountsRepository: Repository<Account>,
  ) {}

  async create(
    createAccountDto: CreateAccountDto,
    ipAddress?: string | null,
  ): Promise<AccountResponse> {
    const existing = await this.accountsRepository.findOne({
      where: { phoneNumber: createAccountDto.phoneNumber },
    });
    if (existing) {
      throw new ConflictException(
        `Account with phone number ${createAccountDto.phoneNumber} already exists`,
      );
    }

    const hasPassword = createAccountDto.password !== undefined;

    const account = this.accountsRepository.create({
      phoneNumber: createAccountDto.phoneNumber,
      passwordHash: hasPassword
        ? await hashPassword(createAccountDto.password as string)
        : null,
      // setPassword is true when the account has no password yet.
      setPassword: !hasPassword,
      status: createAccountDto.status,
      country: createAccountDto.country ?? null,
      sanghat: createAccountDto.sanghat ?? null,
      jilha: createAccountDto.jilha ?? null,
      taluka: createAccountDto.taluka ?? null,
      group: createAccountDto.group ?? null,
      kendra: createAccountDto.kendra ?? null,
      sanchalakName: createAccountDto.sanchalakName ?? null,
      metadata: createAccountDto.metadata ?? null,
      ipAddress: ipAddress ?? null,
    });
    const saved = await this.accountsRepository.save(account);
    return this.toResponse(saved);
  }

  async findAll(): Promise<AccountResponse[]> {
    const accounts = await this.accountsRepository.find({
      order: { createdAt: 'DESC' },
    });
    return accounts.map((account) => this.toResponse(account));
  }

  async findOne(id: string): Promise<AccountResponse> {
    const account = await this.getEntityOrFail(id);
    return this.toResponse(account);
  }

  async update(
    id: string,
    updateAccountDto: UpdateAccountDto,
  ): Promise<AccountResponse> {
    const account = await this.getEntityOrFail(id);

    if (updateAccountDto.password !== undefined) {
      account.passwordHash = await hashPassword(updateAccountDto.password);
      // A password has now been set.
      account.setPassword = false;
    }
    if (updateAccountDto.status !== undefined) {
      account.status = updateAccountDto.status;
    }
    if (updateAccountDto.country !== undefined) {
      account.country = updateAccountDto.country;
    }
    if (updateAccountDto.sanghat !== undefined) {
      account.sanghat = updateAccountDto.sanghat;
    }
    if (updateAccountDto.jilha !== undefined) {
      account.jilha = updateAccountDto.jilha;
    }
    if (updateAccountDto.taluka !== undefined) {
      account.taluka = updateAccountDto.taluka;
    }
    if (updateAccountDto.group !== undefined) {
      account.group = updateAccountDto.group;
    }
    if (updateAccountDto.kendra !== undefined) {
      account.kendra = updateAccountDto.kendra;
    }
    if (updateAccountDto.sanchalakName !== undefined) {
      account.sanchalakName = updateAccountDto.sanchalakName;
    }
    if (updateAccountDto.metadata !== undefined) {
      account.metadata = updateAccountDto.metadata;
    }

    const saved = await this.accountsRepository.save(account);
    return this.toResponse(saved);
  }

  async checkPhone(phoneNumber: string): Promise<CheckPhoneResult> {
    const account = await this.accountsRepository.findOne({
      where: { phoneNumber },
    });

    if (!account) {
      return { exists: false, needsPassword: false };
    }

    return {
      exists: true,
      needsPassword: account.setPassword || !account.passwordHash,
    };
  }

  async setPassword(setPasswordDto: SetPasswordDto): Promise<AccountResponse> {
    const account = await this.accountsRepository.findOne({
      where: { phoneNumber: setPasswordDto.phoneNumber },
    });
    if (!account) {
      throw new NotFoundException('User not found');
    }

    account.passwordHash = await hashPassword(setPasswordDto.password);
    account.setPassword = false;

    const saved = await this.accountsRepository.save(account);
    return this.toResponse(saved);
  }

  async remove(id: string): Promise<void> {
    const result = await this.accountsRepository.delete(id);
    if (!result.affected) {
      throw new NotFoundException(`Account with id ${id} not found`);
    }
  }

  async login(loginDto: LoginDto): Promise<LoginResponse> {
    const account = await this.accountsRepository.findOne({
      where: { phoneNumber: loginDto.phoneNumber },
    });
    if (!account) {
      throw new NotFoundException('User not found');
    }

    if (account.setPassword || !account.passwordHash) {
      throw new UnauthorizedException('Password not set');
    }

    const passwordMatches = await verifyPassword(
      loginDto.password,
      account.passwordHash,
    );
    if (!passwordMatches) {
      throw new UnauthorizedException('Password wrong');
    }

    account.lastLoginTime = new Date();
    const saved = await this.accountsRepository.save(account);

    return {
      account: this.toResponse(saved),
      token: LOGIN_SUCCESS_TOKEN,
    };
  }

  // Builds an .xlsx workbook containing only the header row, for the user to
  // fill in and upload back.
  async generateTemplate(): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet(TEMPLATE_SHEET_NAME);

    sheet.columns = TEMPLATE_COLUMNS.map((column) => ({
      header: column.header,
      key: column.field,
      width: 22,
    }));
    sheet.getRow(1).font = { bold: true };

    const arrayBuffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(arrayBuffer);
  }

  // Parses an uploaded .xlsx file and creates one account per data row.
  // Invalid rows are skipped and reported back in the result.
  async bulkUpload(buffer: Buffer): Promise<BulkUploadResult> {
    const workbook = new ExcelJS.Workbook();
    try {
      await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
    } catch {
      throw new BadRequestException('Could not read the uploaded Excel file');
    }

    const sheet = workbook.worksheets[0];
    if (!sheet) {
      throw new BadRequestException('The uploaded Excel file has no sheets');
    }

    // Map each header cell to its column index based on the template headers.
    const headerRow = sheet.getRow(1);
    const headerToColumn = new Map<string, number>();
    headerRow.eachCell((cell, colNumber) => {
      const header = String(cell.value ?? '').trim();
      if (header) {
        headerToColumn.set(header, colNumber);
      }
    });

    const result: BulkUploadResult = {
      totalRows: 0,
      created: 0,
      failed: 0,
      errors: [],
    };

    for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber++) {
      const row = sheet.getRow(rowNumber);
      const values = TEMPLATE_COLUMNS.reduce<Record<string, string>>(
        (acc, column) => {
          const colIndex = headerToColumn.get(column.header);
          acc[column.field] = colIndex
            ? this.cellToString(row.getCell(colIndex).value)
            : '';
          return acc;
        },
        {},
      );

      // Skip fully empty rows.
      const isEmpty = Object.values(values).every((v) => v === '');
      if (isEmpty) {
        continue;
      }

      result.totalRows += 1;
      const phoneNumber = values.phoneNumber || null;

      try {
        await this.createFromRow(values);
        result.created += 1;
      } catch (error) {
        result.failed += 1;
        result.errors.push({
          row: rowNumber,
          phoneNumber,
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    return result;
  }

  private async createFromRow(values: Record<string, string>): Promise<void> {
    const phoneNumber = values.phoneNumber?.trim();
    if (!isSupportedPhoneNumber(phoneNumber)) {
      throw new Error(
        'phoneNumber must be a 10-digit US, UK or India number with no country code',
      );
    }

    const status = values.status?.trim().toLowerCase();
    if (
      status &&
      !Object.values(AccountStatus).includes(status as AccountStatus)
    ) {
      throw new Error(
        `status must be one of: ${Object.values(AccountStatus).join(', ')}`,
      );
    }

    const password = values.password?.trim();

    await this.create({
      phoneNumber,
      password: password || undefined,
      status: (status as AccountStatus) || undefined,
      country: values.country?.trim() || undefined,
      sanghat: values.sanghat?.trim() || undefined,
      jilha: values.jilha?.trim() || undefined,
      taluka: values.taluka?.trim() || undefined,
      group: values.group?.trim() || undefined,
      kendra: values.kendra?.trim() || undefined,
      sanchalakName: values.sanchalakName?.trim() || undefined,
    });
  }

  private cellToString(value: ExcelJS.CellValue): string {
    if (value === null || value === undefined) {
      return '';
    }
    if (typeof value === 'object') {
      // Handles rich text / hyperlink / formula result cell objects.
      const obj = value as { text?: string; result?: unknown };
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

  private async getEntityOrFail(id: string): Promise<Account> {
    const account = await this.accountsRepository.findOne({ where: { id } });
    if (!account) {
      throw new NotFoundException(`Account with id ${id} not found`);
    }
    return account;
  }

  private toResponse(account: Account): AccountResponse {
    // Strip the password hash before returning to clients.
    const { passwordHash: _passwordHash, ...rest } = account;
    return rest;
  }
}
