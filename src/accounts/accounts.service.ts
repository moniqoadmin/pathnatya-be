import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as ExcelJS from 'exceljs';
import { Account, AccountRole, AccountStatus } from './entities/account.entity';
import { CreateAccountDto } from './dto/create-account.dto';
import { UpdateAccountDto } from './dto/update-account.dto';
import { LoginDto } from './dto/login.dto';
import { SetPasswordDto } from './dto/set-password.dto';
import { hashPassword, verifyPassword } from './password.util';
import { JweService } from './jwe.service';
import {
  COUNTRY_CODE_TO_NAME,
  TEMPLATE_COLUMNS,
  TEMPLATE_SHEET_NAME,
  normalizeHeader,
} from './accounts.template';
import { isSupportedPhoneNumber } from './validators/supported-phone-number.validator';

// Account without the sensitive passwordHash field, used in API responses.
export type AccountResponse = Omit<Account, 'passwordHash'>;

// Returned whenever a login-disabled account attempts to authenticate.
const LOGIN_DISABLED_MESSAGE =
  'Login has been disabled for this account. Please contact your Jababdar Bhai.';

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
    private readonly jweService: JweService,
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
      role: createAccountDto.role ?? AccountRole.USER,
      isOffline: createAccountDto.isOffline ?? false,
      isLoginDisabled: createAccountDto.isLoginDisabled ?? false,
      domSecurity: createAccountDto.domSecurity ?? false,
      chokidar: createAccountDto.chokidar ?? false,
      country: createAccountDto.country ?? null,
      sanghat: createAccountDto.sanghat ?? null,
      jilha: createAccountDto.jilha ?? null,
      taluka: createAccountDto.taluka ?? null,
      group: createAccountDto.group ?? null,
      kendra: createAccountDto.kendra ?? null,
      sanchalakName: createAccountDto.sanchalakName ?? null,
      metadata: createAccountDto.metadata ?? null,
      ipAddress: ipAddress ?? null,
      numberOfTeams: createAccountDto.numberOfTeams ?? null,
      systemAddress: null,
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
    if (updateAccountDto.role !== undefined) {
      account.role = updateAccountDto.role;
    }
    if (updateAccountDto.isOffline !== undefined) {
      account.isOffline = updateAccountDto.isOffline;
    }
    if (updateAccountDto.isLoginDisabled !== undefined) {
      account.isLoginDisabled = updateAccountDto.isLoginDisabled;
    }
    if (updateAccountDto.domSecurity !== undefined) {
      account.domSecurity = updateAccountDto.domSecurity;
    }
    if (updateAccountDto.chokidar !== undefined) {
      account.chokidar = updateAccountDto.chokidar;
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
    if (updateAccountDto.numberOfTeams !== undefined) {
      account.numberOfTeams = updateAccountDto.numberOfTeams;
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

    if (account.isLoginDisabled) {
      throw new ForbiddenException(LOGIN_DISABLED_MESSAGE);
    }

    return {
      exists: true,
      needsPassword: account.setPassword || !account.passwordHash,
    };
  }

  async setPassword(
    setPasswordDto: SetPasswordDto,
    ipAddress?: string | null,
  ): Promise<AccountResponse> {
    const account = await this.accountsRepository.findOne({
      where: { phoneNumber: setPasswordDto.phoneNumber },
    });
    if (!account) {
      throw new NotFoundException('User not found');
    }

    if (account.isLoginDisabled) {
      throw new ForbiddenException(LOGIN_DISABLED_MESSAGE);
    }

    const resolvedIp =
      setPasswordDto.ipAddress ?? ipAddress ?? account.ipAddress ?? null;

    account.passwordHash = await hashPassword(setPasswordDto.password);
    account.setPassword = false;
    account.ipAddress = resolvedIp;
    this.registerSystemAddress(account, resolvedIp);

    const saved = await this.accountsRepository.save(account);
    return this.toResponse(saved);
  }

  async remove(id: string): Promise<void> {
    const result = await this.accountsRepository.delete(id);
    if (!result.affected) {
      throw new NotFoundException(`Account with id ${id} not found`);
    }
  }

  async login(
    loginDto: LoginDto,
    ipAddress?: string | null,
  ): Promise<LoginResponse> {
    const account = await this.accountsRepository.findOne({
      where: { phoneNumber: loginDto.phoneNumber },
    });
    if (!account) {
      throw new NotFoundException('User not found');
    }

    if (account.isLoginDisabled) {
      throw new ForbiddenException(LOGIN_DISABLED_MESSAGE);
    }

    if (account.setPassword || !account.passwordHash) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordMatches = await verifyPassword(
      loginDto.password,
      account.passwordHash,
    );
    if (!passwordMatches) {
      throw new UnauthorizedException('Invalid credentials. If you have forgotten your password, please contact your Jababdar Bhai.');
    }

    const resolvedIp = loginDto.ipAddress ?? ipAddress ?? null;
    this.resolveLoginSystemAddress(account, resolvedIp);

    account.lastLoginTime = new Date();
    account.ipAddress = resolvedIp ?? account.ipAddress;
    const saved = await this.accountsRepository.save(account);
    return {
      account: this.toResponse(saved),
      token: await this.jweService.encryptAccountToken(saved.id),
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
      width: Math.max(18, Math.min(36, column.header.length + 4)),
    }));
    sheet.getRow(1).font = { bold: true };
    sheet.getRow(1).alignment = { wrapText: true, vertical: 'middle' };

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

    // Map template fields to column indexes using normalized / alias headers.
    const fieldToColumn = this.resolveHeaderColumns(sheet.getRow(1));

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
          const colIndex = fieldToColumn.get(column.field);
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

  // Matches sheet headers (including multiline labels from existing files) to
  // template fields. Longer aliases win when multiple columns could match.
  private resolveHeaderColumns(
    headerRow: ExcelJS.Row,
  ): Map<string, number> {
    const fieldToColumn = new Map<string, number>();

    headerRow.eachCell((cell, colNumber) => {
      const normalized = normalizeHeader(this.cellToString(cell.value));
      if (!normalized) {
        return;
      }

      let best:
        | { field: (typeof TEMPLATE_COLUMNS)[number]['field']; aliasLen: number }
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

  private async createFromRow(values: Record<string, string>): Promise<void> {
    // Excel may store mobiles as numbers; strip trailing .0 from stringified floats.
    const phoneNumber = values.phoneNumber?.trim().replace(/\.0$/, '');
    if (!isSupportedPhoneNumber(phoneNumber)) {
      throw new Error(
        'Mobile Number must be a 10-digit US, UK or India number with no country code',
      );
    }

    const role = values.role?.trim();
    if (role && !Object.values(AccountRole).includes(role as AccountRole)) {
      throw new Error(
        `role must be one of: ${Object.values(AccountRole).join(', ')}`,
      );
    }

    const countryCode = values.countryCode?.trim().replace(/\.0$/, '');
    let country: string | undefined;
    if (countryCode) {
      country = COUNTRY_CODE_TO_NAME[countryCode];
      if (!country) {
        throw new Error(
          `Country Code must be one of: ${Object.keys(COUNTRY_CODE_TO_NAME).join(', ')}`,
        );
      }
    }

    const numberOfTeams = this.parseOptionalPositiveInt(
      values.numberOfTeams,
      'No. of Teams Expected',
    );

    const kendraType = values.kendraType?.trim();
    const metadata = kendraType ? { kendraType } : undefined;

    await this.create({
      phoneNumber,
      // No password column → setPassword stays true via create().
      status: AccountStatus.ACTIVE,
      role: (role as AccountRole) || AccountRole.USER,
      isOffline: false,
      isLoginDisabled: false,
      domSecurity: true,
      chokidar: true,
      country,
      // sanghat / jilha left unset when the sheet has no such columns.
      taluka: values.taluka?.trim() || undefined,
      group: values.group?.trim() || undefined,
      kendra: values.kendra?.trim() || undefined,
      sanchalakName: values.sanchalakName?.trim() || undefined,
      numberOfTeams,
      metadata,
    });
  }

  // Parses an optional positive integer cell. Blank → undefined (create default).
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
      // Handles rich text / hyperlink / formula result cell objects.
      const obj = value as {
        text?: string;
        result?: unknown;
        richText?: Array<{ text?: string }>;
      };
      if (Array.isArray(obj.richText)) {
        return obj.richText.map((part) => part.text ?? '').join('').trim();
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

  private async getEntityOrFail(id: string): Promise<Account> {
    const account = await this.accountsRepository.findOne({ where: { id } });
    if (!account) {
      throw new NotFoundException(`Account with id ${id} not found`);
    }
    return account;
  }

  private maxTeams(account: Account): number {
    return account.numberOfTeams ?? 1;
  }

  // Registers an IP into systemAddress, capped by numberOfTeams (default 1).
  private registerSystemAddress(
    account: Account,
    ip: string | null,
  ): void {
    if (!ip) {
      return;
    }

    const addresses = [...(account.systemAddress ?? [])];
    if (addresses.includes(ip)) {
      account.systemAddress = addresses;
      return;
    }

    if (addresses.length >= this.maxTeams(account)) {
      throw new ForbiddenException(
        'System address limit reached for this account',
      );
    }

    addresses.push(ip);
    account.systemAddress = addresses;
  }

  // Login IP rules:
  // - Empty systemAddress → allow (and for 2+ teams, register this IP).
  // - IP already registered → allow.
  // - 2+ teams and slots remain → register the new IP on login, then allow.
  // - Otherwise (full list / single-team unknown IP) → reject.
  private resolveLoginSystemAddress(
    account: Account,
    ip: string | null,
  ): void {
    const addresses = [...(account.systemAddress ?? [])];
    const maxTeams = this.maxTeams(account);

    if (addresses.length === 0) {
      if (maxTeams >= 2 && ip) {
        account.systemAddress = [ip];
      }
      return;
    }

    if (ip && addresses.includes(ip)) {
      return;
    }

    // Additional teams register their IP on login until the cap is filled.
    if (maxTeams >= 2 && ip && addresses.length < maxTeams) {
      addresses.push(ip);
      account.systemAddress = addresses;
      return;
    }

    throw new ForbiddenException(
      'Login not allowed from this system, use the same system as the one used the first time. If the system is not available, please contact your Jababdar Bhai.',
    );
  }

  private toResponse(account: Account): AccountResponse {
    // Strip the password hash before returning to clients.
    const { passwordHash: _passwordHash, ...rest } = account;
    return rest;
  }
}
