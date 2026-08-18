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
import { CheckPhoneDto } from './dto/check-phone.dto';
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
export type SafeTeamAccess = Omit<TeamAccess, 'passwordHash' | 'account'>;

const LOGIN_DISABLED_MESSAGE =
  'Login has been disabled for this team. Please contact your Jababdar Bhai.';

export interface LoginResponse {
  account: AccountResponse;
  teamNumber: number;
  teamAccess: SafeTeamAccess;
  token: string;
}

export interface CheckPhoneResult {
  exists: boolean;
  needsPassword: boolean;
  teamNumber?: number;
  teamAccess?: SafeTeamAccess;
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
    _ipAddress?: string | null,
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
      appConfiguration: createAccountDto.appConfiguration ?? 1,
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
      throw new NotFoundException(
        `Account with phone number ${phoneNumber} not found`,
      );
    }
    return this.toResponse(account);
  }

  private static readonly ADMIN_EDITABLE_FIELDS = new Set([
    'isOffline',
    'numberOfTeams',
    'numberOfReboot',
    'appConfiguration',
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
    if (updateAccountDto.country !== undefined) account.country = updateAccountDto.country;
    if (updateAccountDto.sanghat !== undefined) account.sanghat = updateAccountDto.sanghat;
    if (updateAccountDto.jilha !== undefined) account.jilha = updateAccountDto.jilha;
    if (updateAccountDto.taluka !== undefined) account.taluka = updateAccountDto.taluka;
    if (updateAccountDto.group !== undefined) account.group = updateAccountDto.group;
    if (updateAccountDto.kendra !== undefined) account.kendra = updateAccountDto.kendra;
    if (updateAccountDto.sanchalakName !== undefined)
      account.sanchalakName = updateAccountDto.sanchalakName;
    if (updateAccountDto.metadata !== undefined) account.metadata = updateAccountDto.metadata;

    if (updateAccountDto.numberOfTeams !== undefined) {
      const maxConfigured = await this.teamAccessRepository
        .createQueryBuilder('team')
        .select('MAX(team.teamNumber)', 'max')
        .where('team.accountId = :accountId', { accountId: account.id })
        .getRawOne<{ max: string | null }>();
      const maxTeam = Number(maxConfigured?.max ?? 0);
      if (updateAccountDto.numberOfTeams < maxTeam) {
        throw new BadRequestException(
          `numberOfTeams cannot be less than configured team ${maxTeam}`,
        );
      }
      account.numberOfTeams = updateAccountDto.numberOfTeams;
    }

    if (updateAccountDto.numberOfReboot !== undefined)
      account.numberOfReboot = updateAccountDto.numberOfReboot;
    if (updateAccountDto.appConfiguration !== undefined)
      account.appConfiguration = updateAccountDto.appConfiguration;

    return this.toResponse(await this.accountsRepository.save(account));
  }

  async disableLogin(id: string): Promise<void> {
    const account = await this.getEntityOrFail(id);
    await this.teamAccessRepository.update(
      { accountId: account.id },
      { isLoginDisabled: true },
    );
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

  async checkPhone(dto: CheckPhoneDto): Promise<CheckPhoneResult> {
    const account = await this.accountsRepository.findOne({
      where: { phoneNumber: dto.phoneNumber },
    });
    if (!account) return { exists: false, needsPassword: false };

    const teamAccess = await this.resolveTeamAccess(
      account,
      dto.teamNumber,
      dto.systemAddress ?? null,
      true,
    );
    this.assertTeamEnabled(teamAccess);

    return {
      exists: true,
      needsPassword: teamAccess.setPassword || !teamAccess.passwordHash,
      teamNumber: teamAccess.teamNumber,
      teamAccess: this.toSafeTeamAccess(teamAccess),
    };
  }

  async setPassword(
    dto: SetPasswordDto,
    ipAddress?: string | null,
  ): Promise<{ account: AccountResponse; teamNumber: number; teamAccess: SafeTeamAccess }> {
    const account = await this.accountsRepository.findOne({
      where: { phoneNumber: dto.phoneNumber },
    });
    if (!account) throw new NotFoundException('User not found');

    const teamAccess = await this.resolveTeamAccess(
      account,
      dto.teamNumber,
      dto.systemAddress ?? null,
      true,
    );
    this.assertTeamEnabled(teamAccess);

    if (
      dto.systemAddress &&
      teamAccess.systemAddress &&
      teamAccess.systemAddress !== dto.systemAddress
    ) {
      throw new ForbiddenException(
        'This team is already bound to another system.',
      );
    }

    teamAccess.passwordHash = await hashPassword(dto.password);
    teamAccess.setPassword = false;
    teamAccess.systemAddress = dto.systemAddress ?? teamAccess.systemAddress;
    teamAccess.ipAddress = dto.ipAddress ?? ipAddress ?? teamAccess.ipAddress;
    const saved = await this.teamAccessRepository.save(teamAccess);

    return {
      account: this.toResponse(account),
      teamNumber: saved.teamNumber,
      teamAccess: this.toSafeTeamAccess(saved),
    };
  }

  async remove(id: string): Promise<void> {
    const result = await this.accountsRepository.delete(id);
    if (!result.affected) {
      throw new NotFoundException(`Account with id ${id} not found`);
    }
  }

  async login(
    dto: LoginDto,
    ipAddress?: string | null,
  ): Promise<LoginResponse> {
    const resolvedIp = dto.ipAddress ?? ipAddress ?? null;
    await this.loginProtection.assertAllowed(dto.phoneNumber, resolvedIp);

    const account = await this.accountsRepository.findOne({
      where: { phoneNumber: dto.phoneNumber },
    });
    if (!account) {
      await this.loginProtection.recordFailure(dto.phoneNumber, resolvedIp);
      throw new NotFoundException('User not found');
    }

    const teamAccess = await this.resolveTeamAccess(
      account,
      dto.teamNumber,
      dto.systemAddress ?? null,
      false,
    );
    this.assertTeamEnabled(teamAccess);

    if (teamAccess.setPassword || !teamAccess.passwordHash) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (
      dto.systemAddress &&
      teamAccess.systemAddress &&
      teamAccess.systemAddress !== dto.systemAddress
    ) {
      throw new ForbiddenException(
        'Login not allowed from this system, use the same system as the one used the first time. If the system is not available, please contact your Jababdar Bhai.',
      );
    }

    const passwordMatches = await this.passwordVerification.verify(
      dto.password,
      teamAccess.passwordHash,
    );
    if (!passwordMatches) {
      await this.loginProtection.recordFailure(dto.phoneNumber, resolvedIp);
      throw new UnauthorizedException(
        'Invalid credentials. If you have forgotten your password, please contact your Jababdar Bhai.',
      );
    }

    await this.loginProtection.clear(dto.phoneNumber);
    if (!teamAccess.systemAddress && dto.systemAddress) {
      teamAccess.systemAddress = dto.systemAddress;
    }
    teamAccess.lastLogin = new Date();
    teamAccess.ipAddress = resolvedIp ?? teamAccess.ipAddress;
    const savedTeamAccess = await this.teamAccessRepository.save(teamAccess);

    return {
      account: this.toResponse(account),
      teamNumber: savedTeamAccess.teamNumber,
      teamAccess: this.toSafeTeamAccess(savedTeamAccess),
      token: await this.jweService.encryptAccountToken(account.id),
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
      if (Object.values(values).every((v) => v === '')) continue;
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
        const fieldToColumn = this.resolveHeaderColumns(sheet.getRow(rowNumber));
        if (!fieldToColumn.has('phoneNumber')) continue;
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
      if (!normalized) return;

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

  private async createFromRow(
    values: Record<string, string>,
    existingPhones: Set<string>,
  ): Promise<string> {
    const phoneNumber = this.normalizePhone(values.phoneNumber);
    if (!phoneNumber) throw new Error('Mobile Number is missing');
    if (!isSupportedPhoneNumber(phoneNumber))
      throw new Error('phone number is not 10 digits');
    if (existingPhones.has(phoneNumber)) throw new Error('number already exists');

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
    if (!countryCode) return null;
    return COUNTRY_CODE_TO_NAME[countryCode] ?? countryCode;
  }

  private toErrorMessage(error: unknown): string {
    if (error instanceof ConflictException) return 'number already exists';
    if (
      error instanceof QueryFailedError &&
      (error as QueryFailedError & { code?: string }).code === '23505'
    ) {
      return 'number already exists';
    }
    if (error instanceof HttpException) {
      const response = error.getResponse();
      if (typeof response === 'string') return response;
      if (
        typeof response === 'object' &&
        response !== null &&
        'message' in response
      ) {
        const message = (response as { message: string | string[] }).message;
        return Array.isArray(message) ? message.join('; ') : String(message);
      }
    }
    if (error instanceof Error) return error.message;
    return 'Unknown error';
  }

  private parseOptionalPositiveInt(
    raw: string | undefined,
    fieldName: string,
  ): number | undefined {
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
      if (Array.isArray(obj.richText)) {
        return obj.richText.map((part) => part.text ?? '').join('').trim();
      }
      if (typeof obj.text === 'string') return obj.text.trim();
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
    return Math.min(account.numberOfTeams ?? 1, 20);
  }

  private validateTeamNumber(account: Account, teamNumber: number): void {
    const maxTeams = this.maxTeams(account);
    if (teamNumber < 1 || teamNumber > maxTeams) {
      throw new BadRequestException(
        `teamNumber must be between 1 and ${maxTeams}`,
      );
    }
  }

  private async resolveTeamAccess(
    account: Account,
    requestedTeamNumber: number | undefined,
    systemAddress: string | null,
    createWhenMissing: boolean,
  ): Promise<TeamAccess> {
    if (requestedTeamNumber !== undefined) {
      this.validateTeamNumber(account, requestedTeamNumber);
      let team = await this.teamAccessRepository.findOne({
        where: { accountId: account.id, teamNumber: requestedTeamNumber },
      });
      if (!team && createWhenMissing) {
        team = await this.createTeamAccess(account, requestedTeamNumber, systemAddress);
      }
      if (!team) throw new UnauthorizedException('Invalid credentials');
      if (
        systemAddress &&
        team.systemAddress &&
        team.systemAddress !== systemAddress
      ) {
        throw new ForbiddenException(
          'This team is already bound to another system.',
        );
      }
      return team;
    }

    if (systemAddress) {
      const existingByDevice = await this.teamAccessRepository.findOne({
        where: { accountId: account.id, systemAddress },
      });
      if (existingByDevice) {
        this.validateTeamNumber(account, existingByDevice.teamNumber);
        return existingByDevice;
      }
    }

    if (!createWhenMissing) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const teams = await this.teamAccessRepository.find({
      where: { accountId: account.id },
      order: { teamNumber: 'ASC' },
    });
    const used = new Set(teams.map((team) => team.teamNumber));
    const maxTeams = this.maxTeams(account);
    for (let teamNumber = 1; teamNumber <= maxTeams; teamNumber++) {
      if (!used.has(teamNumber)) {
        return this.createTeamAccess(account, teamNumber, systemAddress);
      }
    }

    throw new ForbiddenException('No team/device slot is available for this account');
  }

  private async createTeamAccess(
    account: Account,
    teamNumber: number,
    systemAddress: string | null,
  ): Promise<TeamAccess> {
    this.validateTeamNumber(account, teamNumber);
    const team = this.teamAccessRepository.create({
      accountId: account.id,
      phoneNumber: account.phoneNumber,
      teamNumber,
      passwordHash: null,
      setPassword: true,
      systemAddress,
      metadata: null,
      isLoginDisabled: false,
      lastLogin: null,
      ipAddress: null,
      domSecurity: false,
      chokidar: false,
      videoOnly: false,
    });
    return this.teamAccessRepository.save(team);
  }

  private assertTeamEnabled(teamAccess: TeamAccess): void {
    if (teamAccess.isLoginDisabled) {
      throw new ForbiddenException(LOGIN_DISABLED_MESSAGE);
    }
  }

  private toSafeTeamAccess(teamAccess: TeamAccess): SafeTeamAccess {
    const { passwordHash, account, ...rest } = teamAccess;
    void passwordHash;
    void account;
    return rest;
  }

  private toResponse(account: Account): AccountResponse {
    return account;
  }
}
