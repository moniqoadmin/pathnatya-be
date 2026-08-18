import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, QueryFailedError, Repository } from 'typeorm';
import * as ExcelJS from 'exceljs';
import { Account, AccountRole, AccountStatus } from './entities/account.entity';
import { Team } from './entities/team.entity';
import { CreateAccountDto } from './dto/create-account.dto';
import { ListAccountsQueryDto } from './dto/list-accounts-query.dto';
import { UpdateAccountDto } from './dto/update-account.dto';
import { UpdateTeamDto } from './dto/update-team.dto';
import { LoginDto } from './dto/login.dto';
import { SetPasswordDto } from './dto/set-password.dto';
import { hashPassword } from './password.util';
import { JweService } from './jwe.service';
import {
  COUNTRY_CODE_TO_NAME,
  TEMPLATE_COLUMNS,
  TEMPLATE_SHEET_NAME,
  normalizeHeader,
} from './accounts.template';
import { isSupportedPhoneNumber } from './validators/supported-phone-number.validator';
import { LoginProtectionService } from './login-protection.service';
import { PasswordVerificationService } from './password-verification.service';

export type TeamResponse = Omit<Team, 'passwordHash' | 'account'>;

export type AccountResponse = Omit<Account, 'teams'> & {
  teams: TeamResponse[];
};

const LOGIN_DISABLED_MESSAGE =
  'Login has been disabled for this account. Please contact your Jababdar Bhai.';

const SYSTEM_ADDRESS_LIMIT_MESSAGE =
  'Login not allowed from this system, use the same system as the one used the first time. If the system is not available, please contact your Jababdar Bhai.';

const SYSTEM_ADDRESS_SET_PASSWORD_LIMIT_MESSAGE =
  'System address limit reached for this account';

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

export interface PaginatedAccountsResponse {
  data: AccountResponse[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

@Injectable()
export class AccountsService {
  constructor(
    @InjectRepository(Account)
    private readonly accountsRepository: Repository<Account>,
    @InjectRepository(Team)
    private readonly teamsRepository: Repository<Team>,
    private readonly jweService: JweService,
    private readonly loginProtection: LoginProtectionService,
    private readonly passwordVerification: PasswordVerificationService,
  ) {}

  async create(createAccountDto: CreateAccountDto): Promise<AccountResponse> {
    const existing = await this.accountsRepository.findOne({
      where: { phoneNumber: createAccountDto.phoneNumber },
    });
    if (existing) {
      throw new ConflictException(
        `Account with phone number ${createAccountDto.phoneNumber} already exists`,
      );
    }

    const hasPassword = createAccountDto.password !== undefined;
    const passwordHash = hasPassword
      ? await hashPassword(createAccountDto.password as string)
      : null;
    const teamCount = createAccountDto.numberOfTeams ?? 1;

    const account = this.accountsRepository.create({
      phoneNumber: createAccountDto.phoneNumber,
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
      numberOfTeams: createAccountDto.numberOfTeams ?? null,
      numberOfReboot: createAccountDto.numberOfReboot ?? 0,
      videoOnly: createAccountDto.videoOnly ?? false,
      appConfiguration: createAccountDto.appConfiguration ?? 1,
      teams: this.buildTeamSlots(teamCount, passwordHash),
    });
    const saved = await this.accountsRepository.save(account);
    return this.toResponse(saved);
  }

  async findAll(
    callerId: string,
    query: ListAccountsQueryDto,
  ): Promise<PaginatedAccountsResponse> {
    const caller = await this.getEntityOrFail(callerId);
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const qb = this.accountsRepository
      .createQueryBuilder('account')
      .orderBy('account.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    if (caller.role === AccountRole.ADMIN) {
      if (!caller.sanghat) {
        throw new ForbiddenException('Admin account has no sanghat assigned');
      }
      qb.andWhere('LOWER(account.sanghat) = LOWER(:sanghat)', {
        sanghat: caller.sanghat,
      });
      qb.andWhere('account.role = :userRole', {
        userRole: AccountRole.USER,
      });
    } else if (
      caller.role === AccountRole.SUPER_ADMIN ||
      caller.role === AccountRole.DEVELOPER
    ) {
      if (query.role) {
        qb.andWhere('account.role = :role', { role: query.role });
      }
    } else {
      throw new ForbiddenException(
        'Only Admin and SuperAdmin can list accounts',
      );
    }

    const search = query.search?.trim();
    if (search) {
      const sanitized = search.replace(/[%_\\]/g, '');
      if (sanitized) {
        qb.andWhere(
          '(account.phoneNumber ILIKE :search OR account.kendra ILIKE :search)',
          { search: `%${sanitized}%` },
        );
      }
    }

    const [accounts, total] = await qb.getManyAndCount();
    await this.attachTeams(accounts);
    return {
      data: accounts.map((account) => this.toResponse(account)),
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findOne(id: string): Promise<AccountResponse> {
    const account = await this.getEntityOrFail(id);
    return this.toResponse(account);
  }

  async findByPhoneNumber(phoneNumber: string): Promise<AccountResponse> {
    const account = await this.accountsRepository.findOne({
      where: { phoneNumber },
    });
    if (!account) {
      throw new NotFoundException(
        `Account with phone number ${phoneNumber} not found`,
      );
    }
    await this.attachTeams([account]);
    return this.toResponse(account);
  }

  private static readonly ADMIN_EDITABLE_FIELDS = new Set([
    'setPassword',
    'teams',
    'isOffline',
    'isLoginDisabled',
    'domSecurity',
    'chokidar',
    'numberOfTeams',
    'numberOfReboot',
    'videoOnly',
    'appConfiguration',
  ]);

  private static readonly ADMIN_EDITABLE_TEAM_FIELDS = new Set([
    'teamNumber',
    'setPassword',
    'isLoginDisabled',
  ]);

  async update(
    callerId: string,
    id: string,
    updateAccountDto: UpdateAccountDto,
  ): Promise<AccountResponse> {
    const caller = await this.getEntityOrFail(callerId);
    const account = await this.getEntityOrFail(id);
    this.assertCanEditAccount(caller, account, updateAccountDto);

    if (
      updateAccountDto.password !== undefined &&
      updateAccountDto.setPassword === true
    ) {
      throw new BadRequestException(
        'Cannot set a password and setPassword=true in the same request',
      );
    }

    if (updateAccountDto.setPassword === true) {
      for (const team of account.teams) {
        this.clearTeamPassword(team);
      }
    } else if (updateAccountDto.setPassword === false) {
      throw new BadRequestException(
        'setPassword=false must be done per team after a password is set',
      );
    }

    if (updateAccountDto.password !== undefined) {
      const team = this.requireTeam(account, 1);
      team.passwordHash = await hashPassword(updateAccountDto.password);
      team.setPassword = false;
    }

    if (updateAccountDto.teams) {
      await this.applyTeamUpdates(account, updateAccountDto.teams);
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
      await this.syncTeamCount(account, updateAccountDto.numberOfTeams);
      account.numberOfTeams = updateAccountDto.numberOfTeams;
    }
    if (updateAccountDto.numberOfReboot !== undefined) {
      account.numberOfReboot = updateAccountDto.numberOfReboot;
    }
    if (updateAccountDto.videoOnly !== undefined) {
      account.videoOnly = updateAccountDto.videoOnly;
    }
    if (updateAccountDto.appConfiguration !== undefined) {
      account.appConfiguration = updateAccountDto.appConfiguration;
    }

    await this.teamsRepository.save(account.teams);
    const saved = await this.accountsRepository.save(account);
    saved.teams = account.teams;
    return this.toResponse(saved);
  }

  /** Blocks the account from authenticating (check-phone, login, set-password). */
  async disableLogin(id: string): Promise<void> {
    const account = await this.getEntityOrFail(id);
    if (account.isLoginDisabled) {
      return;
    }
    account.isLoginDisabled = true;
    await this.accountsRepository.save(account);
  }

  private assertCanEditAccount(
    caller: Account,
    account: Account,
    updateAccountDto: UpdateAccountDto,
  ): void {
    if (caller.role === AccountRole.ADMIN) {
      if (!caller.sanghat) {
        throw new ForbiddenException('Admin account has no sanghat assigned');
      }
      if (account.role !== AccountRole.USER) {
        throw new ForbiddenException('Admins can only edit User accounts');
      }
      if (
        !account.sanghat ||
        account.sanghat.toLowerCase() !== caller.sanghat.toLowerCase()
      ) {
        throw new ForbiddenException(
          'Admins can only edit accounts in their sanghat',
        );
      }

      const provided = Object.keys(updateAccountDto).filter(
        (key) =>
          (updateAccountDto as Record<string, unknown>)[key] !== undefined,
      );
      const disallowed = provided.filter(
        (key) => !AccountsService.ADMIN_EDITABLE_FIELDS.has(key),
      );
      if (disallowed.length > 0) {
        throw new ForbiddenException(
          `Admins cannot edit: ${disallowed.join(', ')}`,
        );
      }
      if (updateAccountDto.setPassword === false) {
        throw new ForbiddenException(
          'Admins can only change setPassword from false to true',
        );
      }
      for (const teamUpdate of updateAccountDto.teams ?? []) {
        const provided = Object.keys(teamUpdate).filter(
          (key) =>
            (teamUpdate as unknown as Record<string, unknown>)[key] !==
            undefined,
        );
        const disallowed = provided.filter(
          (key) => !AccountsService.ADMIN_EDITABLE_TEAM_FIELDS.has(key),
        );
        if (disallowed.length > 0) {
          throw new ForbiddenException(
            `Admins cannot edit team fields: ${disallowed.join(', ')}`,
          );
        }
        if (teamUpdate.setPassword === false) {
          throw new ForbiddenException(
            'Admins can only change setPassword from false to true',
          );
        }
      }
      return;
    }

    if (
      caller.role === AccountRole.SUPER_ADMIN ||
      caller.role === AccountRole.DEVELOPER
    ) {
      return;
    }

    throw new ForbiddenException(
      'Only Admin, SuperAdmin and Developer can edit accounts',
    );
  }

  async checkPhone(
    phoneNumber: string,
    ipAddress?: string | null,
  ): Promise<CheckPhoneResult> {
    const account = await this.findAccountByPhone(phoneNumber);

    if (!account) {
      return { exists: false, needsPassword: false };
    }

    if (account.isLoginDisabled) {
      throw new ForbiddenException(LOGIN_DISABLED_MESSAGE);
    }

    const team = this.resolveTeamForDevice(
      account,
      ipAddress ?? null,
      'check-phone',
    );
    if (team.isLoginDisabled) {
      throw new ForbiddenException(LOGIN_DISABLED_MESSAGE);
    }

    return {
      exists: true,
      needsPassword: team.setPassword || !team.passwordHash,
    };
  }

  async setPassword(
    setPasswordDto: SetPasswordDto,
    ipAddress?: string | null,
  ): Promise<AccountResponse> {
    const account = await this.findAccountByPhone(setPasswordDto.phoneNumber);
    if (!account) {
      throw new NotFoundException('User not found');
    }

    if (account.isLoginDisabled) {
      throw new ForbiddenException(LOGIN_DISABLED_MESSAGE);
    }

    const resolvedIp = setPasswordDto.ipAddress ?? ipAddress ?? null;
    const team = this.resolveTeamForDevice(account, resolvedIp, 'set-password');
    if (team.isLoginDisabled) {
      throw new ForbiddenException(LOGIN_DISABLED_MESSAGE);
    }

    team.passwordHash = await hashPassword(setPasswordDto.password);
    team.setPassword = false;
    if (resolvedIp) {
      team.systemAddress = resolvedIp;
    }
    await this.teamsRepository.save(team);

    return this.toResponse(account);
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
    const resolvedIp = loginDto.ipAddress ?? ipAddress ?? null;
    await this.loginProtection.assertAllowed(loginDto.phoneNumber, resolvedIp);

    const account = await this.findAccountByPhone(loginDto.phoneNumber);
    if (!account) {
      await this.loginProtection.recordFailure(
        loginDto.phoneNumber,
        resolvedIp,
      );
      throw new NotFoundException('User not found');
    }

    if (account.isLoginDisabled) {
      throw new ForbiddenException(LOGIN_DISABLED_MESSAGE);
    }

    const team = this.resolveTeamForDevice(account, resolvedIp, 'login');
    if (team.isLoginDisabled) {
      throw new ForbiddenException(LOGIN_DISABLED_MESSAGE);
    }

    if (team.setPassword || !team.passwordHash) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordMatches = await this.passwordVerification.verify(
      loginDto.password,
      team.passwordHash,
    );
    if (!passwordMatches) {
      await this.loginProtection.recordFailure(
        loginDto.phoneNumber,
        resolvedIp,
      );
      throw new UnauthorizedException(
        'Invalid credentials. If you have forgotten your password, please contact your Jababdar Bhai.',
      );
    }

    await this.loginProtection.clear(loginDto.phoneNumber);
    this.bindTeamOnLogin(account, team, resolvedIp);

    team.lastLoginTime = new Date();
    await this.teamsRepository.save(team);
    return {
      account: this.toResponse(account),
      token: await this.jweService.encryptAccountToken(account.id),
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
  // Invalid / duplicate rows are skipped and collected in `errors` (returned
  // after every row has been processed).
  async bulkUpload(buffer: Buffer): Promise<BulkUploadResult> {
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

      // Skip fully empty rows (title / padding rows below the header).
      const isEmpty = Object.values(values).every((v) => v === '');
      if (isEmpty) {
        continue;
      }

      result.totalRows += 1;

      try {
        const phoneNumber = await this.createFromRow(values, existingPhones);
        existingPhones.add(phoneNumber);
        result.created += 1;
      } catch (error) {
        result.failed += 1;
        result.errors.push(
          this.buildRowError(rowNumber, values, this.toErrorMessage(error)),
        );
      }
    }

    return result;
  }

  // Picks the worksheet that actually holds account rows (e.g. "Kendra" in
  // nivedan files, not the Sanghat/Zilla summary sheets) and locates the
  // header row even when title rows sit above it.
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

  // Matches sheet headers (including multiline labels from existing files) to
  // template fields. Longer aliases win when multiple columns could match.
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

  private async createFromRow(
    values: Record<string, string>,
    existingPhones: Set<string>,
  ): Promise<string> {
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
    const metadata = kendraType ? { kendraType } : undefined;

    await this.create({
      phoneNumber,
      status: AccountStatus.ACTIVE,
      role: (role as AccountRole) || AccountRole.USER,
      isOffline: false,
      isLoginDisabled: false,
      domSecurity: true,
      chokidar: true,
      country,
      sanghat: values.sanghat?.trim() || undefined,
      jilha: values.jilha?.trim() || undefined,
      taluka: values.taluka?.trim() || undefined,
      group: values.group?.trim() || undefined,
      kendra: values.kendra?.trim() || undefined,
      sanchalakName: values.sanchalakName?.trim() || undefined,
      numberOfTeams,
      metadata,
    });

    return phoneNumber;
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

  private toErrorMessage(error: unknown): string {
    if (error instanceof ConflictException) {
      return 'number already exists';
    }
    if (
      error instanceof QueryFailedError &&
      (error as QueryFailedError & { code?: string }).code === '23505'
    ) {
      return 'number already exists';
    }
    if (error instanceof HttpException) {
      const response = error.getResponse();
      if (typeof response === 'string') {
        return response;
      }
      if (
        typeof response === 'object' &&
        response !== null &&
        'message' in response
      ) {
        const message = (response as { message: string | string[] }).message;
        return Array.isArray(message) ? message.join('; ') : String(message);
      }
    }
    if (error instanceof Error) {
      return error.message;
    }
    return 'Unknown error';
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
        formula?: unknown;
        sharedFormula?: unknown;
        richText?: Array<{ text?: string }>;
      };
      // Nivedan files put SUM totals in the first data row — skip formulas.
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

  private async getEntityOrFail(id: string): Promise<Account> {
    const account = await this.accountsRepository.findOne({ where: { id } });
    if (!account) {
      throw new NotFoundException(`Account with id ${id} not found`);
    }
    await this.attachTeams([account]);
    return account;
  }

  private async findAccountByPhone(
    phoneNumber: string,
  ): Promise<Account | null> {
    const account = await this.accountsRepository.findOne({
      where: { phoneNumber },
    });
    if (account) {
      await this.attachTeams([account]);
    }
    return account;
  }

  private async attachTeams(accounts: Account[]): Promise<void> {
    if (accounts.length === 0) {
      return;
    }
    const teams = await this.teamsRepository.find({
      where: { accountId: In(accounts.map((account) => account.id)) },
      order: { teamNumber: 'ASC' },
    });
    const byAccount = new Map<string, Team[]>();
    for (const team of teams) {
      const list = byAccount.get(team.accountId) ?? [];
      list.push(team);
      byAccount.set(team.accountId, list);
    }
    for (const account of accounts) {
      account.teams = byAccount.get(account.id) ?? [];
    }
  }

  private maxTeams(account: Account): number {
    return account.numberOfTeams ?? 1;
  }

  private buildTeamSlots(
    count: number,
    teamOnePasswordHash: string | null,
  ): Team[] {
    return Array.from({ length: Math.max(count, 1) }, (_, index) => {
      const teamNumber = index + 1;
      const passwordHash = teamNumber === 1 ? teamOnePasswordHash : null;
      return this.teamsRepository.create({
        teamNumber,
        passwordHash,
        setPassword: !passwordHash,
        systemAddress: null,
        metadata: null,
        isLoginDisabled: false,
        lastLoginTime: null,
      });
    });
  }

  private requireTeam(account: Account, teamNumber: number): Team {
    const team = account.teams.find((item) => item.teamNumber === teamNumber);
    if (!team) {
      throw new NotFoundException(`Team ${teamNumber} not found`);
    }
    return team;
  }

  private clearTeamPassword(team: Team): void {
    team.passwordHash = null;
    team.setPassword = true;
  }

  private async applyTeamUpdates(
    account: Account,
    updates: UpdateTeamDto[],
  ): Promise<void> {
    for (const update of updates) {
      if (update.password !== undefined && update.setPassword === true) {
        throw new BadRequestException(
          'Cannot set a password and setPassword=true in the same request',
        );
      }
      const team = this.requireTeam(account, update.teamNumber);
      if (update.setPassword === true) {
        this.clearTeamPassword(team);
      } else if (update.setPassword === false) {
        if (!team.passwordHash) {
          throw new BadRequestException(
            'Cannot set setPassword to false unless a password has been set',
          );
        }
        team.setPassword = false;
      }
      if (update.password !== undefined) {
        team.passwordHash = await hashPassword(update.password);
        team.setPassword = false;
      }
      if (update.isLoginDisabled !== undefined) {
        team.isLoginDisabled = update.isLoginDisabled;
      }
    }
  }

  private async syncTeamCount(
    account: Account,
    newCount: number,
  ): Promise<void> {
    const existingNumbers = new Set(
      account.teams.map((team) => team.teamNumber),
    );
    for (let teamNumber = 1; teamNumber <= newCount; teamNumber++) {
      if (!existingNumbers.has(teamNumber)) {
        account.teams.push(
          this.teamsRepository.create({
            accountId: account.id,
            teamNumber,
            passwordHash: null,
            setPassword: true,
            systemAddress: null,
            metadata: null,
            isLoginDisabled: false,
            lastLoginTime: null,
          }),
        );
      }
    }

    const toRemove = account.teams.filter((team) => team.teamNumber > newCount);
    if (toRemove.length === 0) {
      return;
    }

    const registered = toRemove.filter(
      (team) => team.systemAddress || team.passwordHash,
    );
    if (registered.length > 0) {
      const boundCount = account.teams.filter(
        (team) =>
          team.teamNumber <= newCount ||
          team.systemAddress ||
          team.passwordHash,
      ).length;
      throw new BadRequestException(
        `numberOfTeams cannot be less than the ${boundCount} registered team(s)`,
      );
    }
    account.teams = account.teams.filter((team) => team.teamNumber <= newCount);
    const persisted = toRemove.filter((team) => team.id);
    if (persisted.length > 0) {
      await this.teamsRepository.remove(persisted);
    }
  }

  private resolveTeamForDevice(
    account: Account,
    ip: string | null,
    mode: 'login' | 'set-password' | 'check-phone',
  ): Team {
    const teams = [...(account.teams ?? [])].sort(
      (a, b) => a.teamNumber - b.teamNumber,
    );
    if (teams.length === 0) {
      throw new ForbiddenException(SYSTEM_ADDRESS_LIMIT_MESSAGE);
    }

    if (ip) {
      const matched = teams.find((team) => team.systemAddress === ip);
      if (matched) {
        return matched;
      }
    }

    const unbound = teams.find(
      (team) => !team.systemAddress && !team.isLoginDisabled,
    );
    if (unbound) {
      return unbound;
    }

    throw new ForbiddenException(
      mode === 'set-password'
        ? SYSTEM_ADDRESS_SET_PASSWORD_LIMIT_MESSAGE
        : SYSTEM_ADDRESS_LIMIT_MESSAGE,
    );
  }

  // Login binds a new IP onto an unbound team only when the account allows
  // 2+ teams (same rule as the old systemAddress array). Single-team accounts
  // bind on set-password, not on login.
  private bindTeamOnLogin(
    account: Account,
    team: Team,
    ip: string | null,
  ): void {
    if (!ip || team.systemAddress) {
      return;
    }
    if (this.maxTeams(account) >= 2) {
      team.systemAddress = ip;
    }
  }

  private toResponse(account: Account): AccountResponse {
    const teams = [...(account.teams ?? [])]
      .sort((a, b) => a.teamNumber - b.teamNumber)
      .map((team) => {
        const { passwordHash, account: teamAccount, ...rest } = team;
        void passwordHash;
        void teamAccount;
        return rest;
      });
    const { teams: _teams, ...rest } = account;
    void _teams;
    return { ...rest, teams };
  }
}
