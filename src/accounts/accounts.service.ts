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
import { QueryFailedError, Repository } from 'typeorm';
import * as ExcelJS from 'exceljs';
import { Account, AccountRole, AccountStatus } from './entities/account.entity';
import { TeamAccess } from './entities/team-access.entity';
import { CreateAccountDto } from './dto/create-account.dto';
import { ListAccountsQueryDto } from './dto/list-accounts-query.dto';
import { UpdateAccountDto } from './dto/update-account.dto';
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

export type AccountResponse = Account;

const LOGIN_DISABLED_MESSAGE =
  'Login has been disabled for this account. Please contact your Jababdar Bhai.';
const DEVICE_MISMATCH_MESSAGE =
  'Login not allowed from this system, use the same system as the one used the first time. If the system is not available, please contact your Jababdar Bhai.';

export interface SafeTeamAccess {
  id: string;
  teamNumber: number;
  teamName: string;
  setPassword: boolean;
  systemAddress: string | null;
  metadata: Record<string, unknown> | null;
}

export interface LoginResponse {
  account: AccountResponse;
  teamAccess: SafeTeamAccess;
  token: string;
}

export interface CheckPhoneResult {
  exists: boolean;
  needsPassword: boolean;
  numberOfTeams?: number;
  teamNumber?: number;
  teamName?: string;
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
    @InjectRepository(TeamAccess)
    private readonly teamAccessRepository: Repository<TeamAccess>,
    private readonly jweService: JweService,
    private readonly loginProtection: LoginProtectionService,
    private readonly passwordVerification: PasswordVerificationService,
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
      ipAddress: ipAddress ?? null,
      numberOfTeams: createAccountDto.numberOfTeams ?? 1,
      numberOfReboot: createAccountDto.numberOfReboot ?? 0,
      videoOnly: createAccountDto.videoOnly ?? false,
    });
    const saved = await this.accountsRepository.save(account);
    await this.ensureTeamAccess(saved, 1);
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
      qb.andWhere('account.role = :userRole', { userRole: AccountRole.USER });
    } else if (
      caller.role === AccountRole.SUPER_ADMIN ||
      caller.role === AccountRole.DEVELOPER
    ) {
      if (query.role) qb.andWhere('account.role = :role', { role: query.role });
    } else {
      throw new ForbiddenException('Only Admin and SuperAdmin can list accounts');
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
    return {
      data: accounts.map((account) => this.toResponse(account)),
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findOne(id: string): Promise<AccountResponse> {
    return this.toResponse(await this.getEntityOrFail(id));
  }

  async findByPhoneNumber(phoneNumber: string): Promise<AccountResponse> {
    const account = await this.accountsRepository.findOne({ where: { phoneNumber } });
    if (!account) {
      throw new NotFoundException(`Account with phone number ${phoneNumber} not found`);
    }
    return this.toResponse(account);
  }

  private static readonly ADMIN_EDITABLE_FIELDS = new Set([
    'isOffline',
    'isLoginDisabled',
    'domSecurity',
    'chokidar',
    'numberOfTeams',
    'numberOfReboot',
    'videoOnly',
  ]);

  async update(
    callerId: string,
    id: string,
    updateAccountDto: UpdateAccountDto,
  ): Promise<AccountResponse> {
    const caller = await this.getEntityOrFail(callerId);
    const account = await this.getEntityOrFail(id);
    this.assertCanEditAccount(caller, account, updateAccountDto);

    if (updateAccountDto.status !== undefined) account.status = updateAccountDto.status;
    if (updateAccountDto.role !== undefined) account.role = updateAccountDto.role;
    if (updateAccountDto.isOffline !== undefined) account.isOffline = updateAccountDto.isOffline;
    if (updateAccountDto.isLoginDisabled !== undefined) account.isLoginDisabled = updateAccountDto.isLoginDisabled;
    if (updateAccountDto.domSecurity !== undefined) account.domSecurity = updateAccountDto.domSecurity;
    if (updateAccountDto.chokidar !== undefined) account.chokidar = updateAccountDto.chokidar;
    if (updateAccountDto.country !== undefined) account.country = updateAccountDto.country;
    if (updateAccountDto.sanghat !== undefined) account.sanghat = updateAccountDto.sanghat;
    if (updateAccountDto.jilha !== undefined) account.jilha = updateAccountDto.jilha;
    if (updateAccountDto.taluka !== undefined) account.taluka = updateAccountDto.taluka;
    if (updateAccountDto.group !== undefined) account.group = updateAccountDto.group;
    if (updateAccountDto.kendra !== undefined) account.kendra = updateAccountDto.kendra;
    if (updateAccountDto.sanchalakName !== undefined) account.sanchalakName = updateAccountDto.sanchalakName;
    if (updateAccountDto.metadata !== undefined) account.metadata = updateAccountDto.metadata;

    if (updateAccountDto.numberOfTeams !== undefined) {
      const highestConfigured = await this.teamAccessRepository
        .createQueryBuilder('team')
        .select('MAX(team.teamNumber)', 'max')
        .where('team.accountId = :accountId', { accountId: account.id })
        .getRawOne<{ max: string | null }>();
      const maxTeam = Number(highestConfigured?.max ?? 0);
      if (updateAccountDto.numberOfTeams < maxTeam) {
        throw new BadRequestException(
          `numberOfTeams cannot be less than configured Team ${maxTeam}`,
        );
      }
      account.numberOfTeams = updateAccountDto.numberOfTeams;
    }

    if (updateAccountDto.numberOfReboot !== undefined) account.numberOfReboot = updateAccountDto.numberOfReboot;
    if (updateAccountDto.videoOnly !== undefined) account.videoOnly = updateAccountDto.videoOnly;

    const saved = await this.accountsRepository.save(account);
    return this.toResponse(saved);
  }

  async disableLogin(id: string): Promise<void> {
    const account = await this.getEntityOrFail(id);
    if (!account.isLoginDisabled) {
      account.isLoginDisabled = true;
      await this.accountsRepository.save(account);
    }
  }

  private assertCanEditAccount(
    caller: Account,
    account: Account,
    updateAccountDto: UpdateAccountDto,
  ): void {
    if (caller.role === AccountRole.ADMIN) {
      if (!caller.sanghat) throw new ForbiddenException('Admin account has no sanghat assigned');
      if (account.role !== AccountRole.USER) throw new ForbiddenException('Admins can only edit User accounts');
      if (!account.sanghat || account.sanghat.toLowerCase() !== caller.sanghat.toLowerCase()) {
        throw new ForbiddenException('Admins can only edit accounts in their sanghat');
      }
      const provided = Object.keys(updateAccountDto).filter(
        (key) => (updateAccountDto as Record<string, unknown>)[key] !== undefined,
      );
      const disallowed = provided.filter((key) => !AccountsService.ADMIN_EDITABLE_FIELDS.has(key));
      if (disallowed.length > 0) {
        throw new ForbiddenException(`Admins cannot edit: ${disallowed.join(', ')}`);
      }
      return;
    }

    if (caller.role === AccountRole.SUPER_ADMIN || caller.role === AccountRole.DEVELOPER) return;
    throw new ForbiddenException('Only Admin, SuperAdmin and Developer can edit accounts');
  }

  async checkPhone(phoneNumber: string, teamNumber: number): Promise<CheckPhoneResult> {
    const account = await this.accountsRepository.findOne({ where: { phoneNumber } });
    if (!account) return { exists: false, needsPassword: false };
    if (account.isLoginDisabled) throw new ForbiddenException(LOGIN_DISABLED_MESSAGE);

    this.assertValidTeam(account, teamNumber);
    const team = await this.ensureTeamAccess(account, teamNumber);
    return {
      exists: true,
      needsPassword: team.setPassword || !team.passwordHash,
      numberOfTeams: this.maxTeams(account),
      teamNumber: team.teamNumber,
      teamName: team.teamName,
    };
  }

  async setPassword(
    setPasswordDto: SetPasswordDto,
    ipAddress?: string | null,
  ): Promise<SafeTeamAccess> {
    const account = await this.accountsRepository.findOne({
      where: { phoneNumber: setPasswordDto.phoneNumber },
    });
    if (!account) throw new NotFoundException('User not found');
    if (account.isLoginDisabled) throw new ForbiddenException(LOGIN_DISABLED_MESSAGE);

    this.assertValidTeam(account, setPasswordDto.teamNumber);
    const team = await this.ensureTeamAccess(account, setPasswordDto.teamNumber);
    const resolvedAddress = setPasswordDto.ipAddress ?? ipAddress ?? null;

    if (team.systemAddress && resolvedAddress && team.systemAddress !== resolvedAddress) {
      throw new ForbiddenException(DEVICE_MISMATCH_MESSAGE);
    }

    team.passwordHash = await hashPassword(setPasswordDto.password);
    team.setPassword = false;
    if (!team.systemAddress && resolvedAddress) team.systemAddress = resolvedAddress;
    const saved = await this.teamAccessRepository.save(team);
    return this.toSafeTeamAccess(saved);
  }

  async remove(id: string): Promise<void> {
    const result = await this.accountsRepository.delete(id);
    if (!result.affected) throw new NotFoundException(`Account with id ${id} not found`);
  }

  async login(loginDto: LoginDto, ipAddress?: string | null): Promise<LoginResponse> {
    const resolvedAddress = loginDto.ipAddress ?? ipAddress ?? null;
    await this.loginProtection.assertAllowed(loginDto.phoneNumber, resolvedAddress);

    const account = await this.accountsRepository.findOne({
      where: { phoneNumber: loginDto.phoneNumber },
    });
    if (!account) {
      await this.loginProtection.recordFailure(loginDto.phoneNumber, resolvedAddress);
      throw new NotFoundException('User not found');
    }
    if (account.isLoginDisabled) throw new ForbiddenException(LOGIN_DISABLED_MESSAGE);

    this.assertValidTeam(account, loginDto.teamNumber);
    const team = await this.ensureTeamAccess(account, loginDto.teamNumber);
    if (team.setPassword || !team.passwordHash) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordMatches = await this.passwordVerification.verify(
      loginDto.password,
      team.passwordHash,
    );
    if (!passwordMatches) {
      await this.loginProtection.recordFailure(loginDto.phoneNumber, resolvedAddress);
      throw new UnauthorizedException(
        'Invalid credentials. If you have forgotten your password, please contact your Jababdar Bhai.',
      );
    }

    if (team.systemAddress && resolvedAddress && team.systemAddress !== resolvedAddress) {
      throw new ForbiddenException(DEVICE_MISMATCH_MESSAGE);
    }
    if (!team.systemAddress && resolvedAddress) {
      team.systemAddress = resolvedAddress;
      await this.teamAccessRepository.save(team);
    }

    await this.loginProtection.clear(loginDto.phoneNumber);
    account.lastLoginTime = new Date();
    account.ipAddress = resolvedAddress ?? account.ipAddress;
    const savedAccount = await this.accountsRepository.save(account);

    return {
      account: this.toResponse(savedAccount),
      teamAccess: this.toSafeTeamAccess(team),
      token: await this.jweService.encryptAccountToken(savedAccount.id),
    };
  }

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

  async bulkUpload(buffer: Buffer): Promise<BulkUploadResult> {
    const workbook = new ExcelJS.Workbook();
    try {
      await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
    } catch {
      throw new BadRequestException('Could not read the uploaded Excel file');
    }

    const { sheet, headerRowNumber, fieldToColumn } = this.findUploadSheet(workbook);
    const existingAccounts = await this.accountsRepository.find({ select: ['phoneNumber'] });
    const existingPhones = new Set(existingAccounts.map((account) => account.phoneNumber));
    const result: BulkUploadResult = { totalRows: 0, created: 0, failed: 0, errors: [] };

    for (let rowNumber = headerRowNumber + 1; rowNumber <= sheet.rowCount; rowNumber++) {
      const row = sheet.getRow(rowNumber);
      const values = TEMPLATE_COLUMNS.reduce<Record<string, string>>((acc, column) => {
        const colIndex = fieldToColumn.get(column.field);
        acc[column.field] = colIndex ? this.cellToString(row.getCell(colIndex).value) : '';
        return acc;
      }, {});
      if (Object.values(values).every((v) => v === '')) continue;
      result.totalRows += 1;
      try {
        const phoneNumber = await this.createFromRow(values, existingPhones);
        existingPhones.add(phoneNumber);
        result.created += 1;
      } catch (error) {
        result.failed += 1;
        result.errors.push(this.buildRowError(rowNumber, values, this.toErrorMessage(error)));
      }
    }
    return result;
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
      | { sheet: ExcelJS.Worksheet; headerRowNumber: number; fieldToColumn: Map<string, number>; score: number }
      | undefined;

    for (const sheet of workbook.worksheets) {
      const scanLimit = Math.min(40, sheet.rowCount);
      for (let rowNumber = 1; rowNumber <= scanLimit; rowNumber++) {
        const fieldToColumn = this.resolveHeaderColumns(sheet.getRow(rowNumber));
        if (!fieldToColumn.has('phoneNumber')) continue;
        const score = fieldToColumn.size + (sheet.name.trim().toLowerCase() === 'kendra' ? 100 : 0);
        if (!best || score > best.score) best = { sheet, headerRowNumber: rowNumber, fieldToColumn, score };
        break;
      }
    }
    if (!best) throw new BadRequestException('Could not find a sheet with a Mobile Number column');
    return best;
  }

  private resolveHeaderColumns(headerRow: ExcelJS.Row): Map<string, number> {
    const fieldToColumn = new Map<string, number>();
    headerRow.eachCell((cell, colNumber) => {
      const normalized = normalizeHeader(this.cellToString(cell.value));
      if (!normalized) return;
      let best: { field: (typeof TEMPLATE_COLUMNS)[number]['field']; aliasLen: number } | undefined;
      for (const column of TEMPLATE_COLUMNS) {
        for (const alias of [normalizeHeader(column.header), ...column.aliases.map(normalizeHeader)]) {
          if (alias === normalized && (!best || alias.length > best.aliasLen)) {
            best = { field: column.field, aliasLen: alias.length };
          }
        }
      }
      if (best && !fieldToColumn.has(best.field)) fieldToColumn.set(best.field, colNumber);
    });
    return fieldToColumn;
  }

  private async createFromRow(values: Record<string, string>, existingPhones: Set<string>): Promise<string> {
    const phoneNumber = this.normalizePhone(values.phoneNumber);
    if (!phoneNumber) throw new Error('Mobile Number is missing');
    if (!isSupportedPhoneNumber(phoneNumber)) throw new Error('phone number is not 10 digits');
    if (existingPhones.has(phoneNumber)) throw new Error('number already exists');

    const role = values.role?.trim();
    if (role && !Object.values(AccountRole).includes(role as AccountRole)) {
      throw new Error(`role must be one of: ${Object.values(AccountRole).join(', ')}`);
    }

    const country = this.resolveCountry(values);
    const numberOfTeams = this.parseOptionalPositiveInt(values.numberOfTeams, 'No. of Teams Expected');
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
    if (countryName) return countryName;
    const countryCode = values.countryCode?.trim().replace(/\.0$/, '');
    if (!countryCode) return undefined;
    const mapped = COUNTRY_CODE_TO_NAME[countryCode];
    if (!mapped) {
      throw new Error(`Country Code must be one of: ${Object.keys(COUNTRY_CODE_TO_NAME).join(', ')}`);
    }
    return mapped;
  }

  private normalizePhone(raw: string | undefined): string {
    return (raw ?? '').trim().replace(/\.0$/, '');
  }

  private buildRowError(rowNumber: number, values: Record<string, string>, error: string): BulkUploadError {
    return {
      row: rowNumber,
      sn: values.sn?.trim() || null,
      country: values.country?.trim() || this.countryFromCode(values.countryCode),
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
    if (!countryCode) return null;
    return COUNTRY_CODE_TO_NAME[countryCode] ?? countryCode;
  }

  private toErrorMessage(error: unknown): string {
    if (error instanceof ConflictException) return 'number already exists';
    if (error instanceof QueryFailedError && (error as QueryFailedError & { code?: string }).code === '23505') {
      return 'number already exists';
    }
    if (error instanceof HttpException) {
      const response = error.getResponse();
      if (typeof response === 'string') return response;
      if (typeof response === 'object' && response !== null && 'message' in response) {
        const message = (response as { message: string | string[] }).message;
        return Array.isArray(message) ? message.join('; ') : String(message);
      }
    }
    if (error instanceof Error) return error.message;
    return 'Unknown error';
  }

  private parseOptionalPositiveInt(raw: string | undefined, fieldName: string): number | undefined {
    const value = raw?.trim().replace(/\.0$/, '');
    if (!value) return undefined;
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 20) {
      throw new Error(`${fieldName} must be an integer between 1 and 20`);
    }
    return parsed;
  }

  private cellToString(value: ExcelJS.CellValue): string {
    if (value === null || value === undefined) return '';
    if (typeof value === 'object') {
      const obj = value as {
        text?: string;
        result?: unknown;
        formula?: unknown;
        sharedFormula?: unknown;
        richText?: Array<{ text?: string }>;
      };
      if (obj.formula !== undefined || obj.sharedFormula !== undefined) return '';
      if (Array.isArray(obj.richText)) return obj.richText.map((part) => part.text ?? '').join('').trim();
      if (typeof obj.text === 'string') return obj.text.trim();
      if (obj.result !== undefined && obj.result !== null) return String(obj.result).trim();
      return '';
    }
    return String(value).trim();
  }

  private async getEntityOrFail(id: string): Promise<Account> {
    const account = await this.accountsRepository.findOne({ where: { id } });
    if (!account) throw new NotFoundException(`Account with id ${id} not found`);
    return account;
  }

  private maxTeams(account: Account): number {
    return Math.min(Math.max(account.numberOfTeams ?? 1, 1), 20);
  }

  private assertValidTeam(account: Account, teamNumber: number): void {
    if (!Number.isInteger(teamNumber) || teamNumber < 1 || teamNumber > this.maxTeams(account)) {
      throw new BadRequestException(
        `teamNumber must be between 1 and ${this.maxTeams(account)} for this account`,
      );
    }
  }

  private defaultTeamName(teamNumber: number): string {
    return teamNumber === 1 ? 'Krishna' : `Team ${teamNumber}`;
  }

  private async ensureTeamAccess(account: Account, teamNumber: number): Promise<TeamAccess> {
    this.assertValidTeam(account, teamNumber);
    let team = await this.teamAccessRepository.findOne({
      where: { accountId: account.id, teamNumber },
    });
    if (team) return team;

    team = this.teamAccessRepository.create({
      accountId: account.id,
      teamNumber,
      teamName: this.defaultTeamName(teamNumber),
      passwordHash: null,
      setPassword: true,
      systemAddress: null,
      metadata: null,
    });
    return this.teamAccessRepository.save(team);
  }

  private toSafeTeamAccess(team: TeamAccess): SafeTeamAccess {
    return {
      id: team.id,
      teamNumber: team.teamNumber,
      teamName: team.teamName,
      setPassword: team.setPassword,
      systemAddress: team.systemAddress,
      metadata: team.metadata,
    };
  }

  private toResponse(account: Account): AccountResponse {
    return account;
  }
}
