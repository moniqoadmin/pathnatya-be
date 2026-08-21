import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
  forwardRef,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, QueryFailedError, Repository } from 'typeorm';
import * as ExcelJS from 'exceljs';
import {
  Account,
  AccountRole,
  parseAccountRole,
} from './entities/account.entity';
import { Team } from './entities/team.entity';
import { CreateAccountDto } from './dto/create-account.dto';
import {
  authorizeCreateAccount,
  authorizeDeleteAccount,
  authorizeViewAccount,
} from './account-authorization';
import { BulkUpdateFlagsDto } from './dto/bulk-update-flags.dto';
import { ListAccountsQueryDto } from './dto/list-accounts-query.dto';
import { LoginAnalyticsQueryDto } from './dto/login-analytics-query.dto';
import { UpdateAccountDto } from './dto/update-account.dto';
import { PatchTeamDto, UpdateTeamDto } from './dto/update-team.dto';
import { LoginDto } from './dto/login.dto';
import { SetPasswordDto } from './dto/set-password.dto';
import { hashPassword } from './password.util';
import { JweService } from './jwe.service';
import {
  ACCOUNT_FIELD_DEFAULTS,
  COUNTRY_CODE_TO_NAME,
  CREATE_TEMPLATE_COLUMNS,
  TEMPLATE_COLUMNS,
  TEMPLATE_SHEET_NAME,
  normalizeHeader,
} from './accounts.template';
import { isSupportedPhoneNumber } from './validators/supported-phone-number.validator';
import { LoginProtectionService } from './login-protection.service';
import { PasswordVerificationService } from './password-verification.service';
import {
  AuditTrailService,
  USER_ENABLED_EVENT,
} from '../audit-trail/audit-trail.service';
import { AppCacheService } from '../config/app-cache.service';
import {
  CACHE_TTL_LOGIN_ANALYTICS_MS,
  loginAnalyticsCacheKeys,
} from '../config/cache.config';
import { EntitlementsService } from '../entitlements/entitlements.service';

export type TeamResponse = Omit<Team, 'passwordHash' | 'account'>;

export type AccountResponse = Omit<Account, 'teams'> & {
  teams: TeamResponse[];
};

export type TeamsResponse = {
  teams: TeamResponse[];
};

export type TeamItemResponse = {
  team: TeamResponse;
};

const LOGIN_DISABLED_MESSAGE =
  'Login has been disabled for this device. Please contact your Jababdar Bhai.';

const SYSTEM_ADDRESS_LIMIT_MESSAGE =
  'Login not allowed from this system, use the same system as the one used the first time. If the system is not available, please contact your Jababdar Bhai.';

const SYSTEM_ADDRESS_SET_PASSWORD_LIMIT_MESSAGE =
  'System address limit reached for this account';

export interface LoginResponse {
  account: Omit<AccountResponse, 'teams'>;
  team: TeamResponse;
  token: string;
}

export interface SetPasswordResponse extends AccountResponse {
  teamNumber: number;
}

export interface CheckPhoneResult {
  exists: boolean;
  // True when the account exists but has not set a password yet,
  // i.e. the client should proceed to call set-password.
  needsPassword: boolean;
  role?: AccountRole;
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

export type SanghatsResponse = {
  sanghats: string[];
};

export type LoginAnalyticsResponse = {
  accountsLoggedIn: number;
  teamsLoggedIn: number;
  totalAccounts: number;
  totalTeams: number;
};

export type BulkUpdateFlagsError = {
  phoneNumber: string;
  kendra: string | null;
  sanghat: string | null;
  teamNumber: number | null;
  fields: string[];
  error: string;
};

export type BulkUpdateFlagsResponse = {
  sanghat: string | null;
  all: boolean;
  usersChanged: number;
  teamsChanged: number;
  errors: BulkUpdateFlagsError[];
};

export type BulkFlagsProgress = {
  usersChanged: number;
  teamsChanged: number;
  errors: BulkUpdateFlagsError[];
};

const BULK_FLAGS_UPDATED_EVENT = 'BULK_FLAGS_UPDATED';

const UNCHANGED_VALUE_ERROR = 'value did not change';

const BULK_FLAGS_BATCH_SIZE = 500;

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
    @Inject(forwardRef(() => AuditTrailService))
    private readonly auditTrailService: AuditTrailService,
    @Inject(forwardRef(() => EntitlementsService))
    private readonly entitlementsService: EntitlementsService,
    private readonly cache: AppCacheService,
  ) {}

  async createForCaller(
    callerId: string,
    createAccountDto: CreateAccountDto,
  ): Promise<AccountResponse> {
    const caller = await this.getEntityOrFail(callerId);
    return this.create(authorizeCreateAccount(caller, createAccountDto));
  }

  async create(createAccountDto: CreateAccountDto): Promise<AccountResponse> {
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
      role: createAccountDto.role ?? ACCOUNT_FIELD_DEFAULTS.role,
      isOffline: createAccountDto.isOffline ?? ACCOUNT_FIELD_DEFAULTS.isOffline,
      country: createAccountDto.country ?? null,
      sanghat: createAccountDto.sanghat ?? null,
      jilha: createAccountDto.jilha ?? null,
      taluka: createAccountDto.taluka ?? null,
      group: createAccountDto.group ?? null,
      kendra: createAccountDto.kendra ?? null,
      sanchalakName: createAccountDto.sanchalakName ?? null,
      metadata: {
        source: ACCOUNT_FIELD_DEFAULTS.source,
        ...(createAccountDto.metadata ?? {}),
      },
      numberOfTeams: createAccountDto.numberOfTeams ?? null,
      numberOfReboot:
        createAccountDto.numberOfReboot ??
        ACCOUNT_FIELD_DEFAULTS.numberOfReboot,
      logoutButton:
        createAccountDto.logoutButton ?? ACCOUNT_FIELD_DEFAULTS.logoutButton,
      appConfiguration:
        createAccountDto.appConfiguration ??
        ACCOUNT_FIELD_DEFAULTS.appConfiguration,
    });
    const saved = await this.accountsRepository.save(account);
    saved.teams = [];
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

    const sanghat = query.sanghat?.trim();
    if (sanghat) {
      qb.andWhere(
        'LOWER(BTRIM(account.sanghat)) = LOWER(BTRIM(:sanghatFilter))',
        { sanghatFilter: sanghat },
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

  async listSanghats(): Promise<SanghatsResponse> {
    const rows = await this.accountsRepository
      .createQueryBuilder('account')
      .select('MIN(account.sanghat)', 'sanghat')
      .where('account.sanghat IS NOT NULL')
      .andWhere("BTRIM(account.sanghat) <> ''")
      .groupBy('LOWER(BTRIM(account.sanghat))')
      .orderBy('MIN(account.sanghat)', 'ASC')
      .getRawMany<{ sanghat: string }>();

    return { sanghats: rows.map((row) => row.sanghat) };
  }

  async getLoginAnalytics(
    query: LoginAnalyticsQueryDto,
  ): Promise<LoginAnalyticsResponse> {
    const sanghat = query.sanghat?.trim() || '';
    const since = query.since?.trim() || '';
    const cacheKey = loginAnalyticsCacheKeys.one(
      sanghat.toLowerCase() || '*',
      since || '*',
    );
    const cached = await this.cache.get<LoginAnalyticsResponse>(cacheKey);
    if (cached) {
      return cached;
    }

    const result = await this.loadLoginAnalytics(sanghat, since);
    await this.cache.set(cacheKey, result, CACHE_TTL_LOGIN_ANALYTICS_MS);
    return result;
  }

  private async loadLoginAnalytics(
    sanghat: string,
    sinceRaw: string,
  ): Promise<LoginAnalyticsResponse> {
    const since = sinceRaw ? new Date(sinceRaw) : undefined;
    const loggedInCondition = since
      ? 'team.last_login_time IS NOT NULL AND team.last_login_time >= :since'
      : 'team.last_login_time IS NOT NULL';

    const qb = this.accountsRepository
      .createQueryBuilder('account')
      .leftJoin('account.teams', 'team')
      .select('COUNT(DISTINCT account.id)', 'totalAccounts')
      .addSelect('COUNT(team.id)', 'totalTeams')
      .addSelect(
        `COUNT(team.id) FILTER (WHERE ${loggedInCondition})`,
        'teamsLoggedIn',
      )
      .addSelect(
        `COUNT(DISTINCT team.account_id) FILTER (WHERE ${loggedInCondition})`,
        'accountsLoggedIn',
      );

    if (sanghat) {
      qb.andWhere(
        'LOWER(BTRIM(account.sanghat)) = LOWER(BTRIM(:sanghatFilter))',
        { sanghatFilter: sanghat },
      );
    }
    if (since) {
      qb.setParameter('since', since);
    }

    const row = await qb.getRawOne<{
      totalAccounts: string | number | null;
      totalTeams: string | number | null;
      teamsLoggedIn: string | number | null;
      accountsLoggedIn: string | number | null;
    }>();

    return {
      accountsLoggedIn: Number(row?.accountsLoggedIn ?? 0),
      teamsLoggedIn: Number(row?.teamsLoggedIn ?? 0),
      totalAccounts: Number(row?.totalAccounts ?? 0),
      totalTeams: Number(row?.totalTeams ?? 0),
    };
  }

  async bulkUpdateFlags(
    callerId: string,
    dto: BulkUpdateFlagsDto,
    onProgress?: (progress: BulkFlagsProgress) => Promise<void>,
  ): Promise<BulkUpdateFlagsResponse> {
    const all = dto.all === true;
    const sanghat = dto.sanghat?.trim() || null;
    if (all && sanghat) {
      throw new BadRequestException(
        'Provide either sanghat or all=true, not both',
      );
    }
    if (!all && !sanghat) {
      throw new BadRequestException('Provide sanghat or all=true');
    }

    const accountSet = this.toBulkAccountSet(dto);
    const hasAccountFlags = Object.keys(accountSet).length > 0;
    const hasTeamFlags =
      dto.isLoginDisabled !== undefined || dto.setPassword === true;

    if (!hasAccountFlags && !hasTeamFlags) {
      throw new BadRequestException(
        'Provide at least one of: logoutButton, appConfiguration, numberOfReboot, isOffline, isLoginDisabled, setPassword',
      );
    }

    const errors: BulkUpdateFlagsError[] = [];
    const collectErrors = !onProgress;
    let errorCount = 0;
    let usersChanged = 0;
    let teamsChanged = 0;
    let afterId: string | null = null;
    let scanned = 0;

    for (;;) {
      const batch = await this.loadBulkFlagBatch(sanghat, afterId);
      if (batch.length === 0) {
        break;
      }
      scanned += batch.length;
      afterId = batch[batch.length - 1].id;
      await this.attachTeams(batch);

      const planned = this.planBulkFlagUpdates(
        batch,
        dto,
        accountSet,
        hasAccountFlags,
        hasTeamFlags,
      );
      await this.applyBulkFlagUpdates(accountSet, dto, planned);
      usersChanged += planned.changedAccountIds.size;
      teamsChanged += planned.teamIdsToUpdate.length;
      errorCount += planned.errors.length;
      if (collectErrors) {
        errors.push(...planned.errors);
      }
      if (onProgress) {
        await onProgress({
          usersChanged,
          teamsChanged,
          errors: planned.errors,
        });
      }
      if (batch.length < BULK_FLAGS_BATCH_SIZE) {
        break;
      }
    }

    if (scanned === 0) {
      if (sanghat) {
        throw new NotFoundException(
          `No accounts found for sanghat "${sanghat}"`,
        );
      }
      return {
        sanghat: null,
        all: true,
        usersChanged: 0,
        teamsChanged: 0,
        errors: [],
      };
    }

    await this.auditTrailService.create(callerId, {
      event:
        dto.isLoginDisabled === false
          ? USER_ENABLED_EVENT
          : BULK_FLAGS_UPDATED_EVENT,
      message:
        dto.isLoginDisabled === false
          ? dto.reason!
          : all
            ? 'Bulk-updated flags for all accounts'
            : `Bulk-updated flags for sanghat ${sanghat}`,
      metaData: {
        sanghat,
        all,
        flags: this.toBulkFlagsMeta(dto),
        usersChanged,
        teamsChanged,
        errorCount,
      },
    });

    return {
      sanghat,
      all,
      usersChanged,
      teamsChanged,
      errors: collectErrors ? errors : [],
    };
  }

  async findOneForCaller(
    callerId: string,
    id: string,
  ): Promise<AccountResponse> {
    const caller = await this.getEntityOrFail(callerId);
    const account = await this.getEntityOrFail(id);
    authorizeViewAccount(caller, account);
    return this.toResponse(account);
  }

  async findTeams(callerId: string, accountId: string): Promise<TeamsResponse> {
    const caller = await this.getEntityOrFail(callerId);
    const account = await this.getEntityOrFail(accountId);
    authorizeViewAccount(caller, account);
    return this.toTeamsResponse(account.teams);
  }

  async findTeam(callerId: string, teamId: string): Promise<TeamItemResponse> {
    const caller = await this.getEntityOrFail(callerId);
    const team = await this.teamsRepository.findOne({
      where: { id: teamId },
    });
    if (!team) {
      throw new NotFoundException(`Team ${teamId} not found`);
    }
    const account = await this.accountsRepository.findOne({
      where: { id: team.accountId },
    });
    if (!account) {
      throw new NotFoundException(
        `Account with id ${team.accountId} not found`,
      );
    }
    authorizeViewAccount(caller, account);
    return { team: this.toTeamResponse(team) };
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
    'numberOfTeams',
    'numberOfReboot',
    'logoutButton',
    'appConfiguration',
  ]);

  private static readonly ADMIN_EDITABLE_TEAM_FIELDS = new Set([
    'teamNumber',
    'setPassword',
    'isLoginDisabled',
    'reason',
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

    const enabledReasons: string[] = [];
    if (updateAccountDto.teams) {
      enabledReasons.push(
        ...(await this.applyTeamUpdates(account, updateAccountDto.teams)),
      );
    }

    if (updateAccountDto.role !== undefined) {
      account.role = updateAccountDto.role;
    }
    if (updateAccountDto.isOffline !== undefined) {
      account.isOffline = updateAccountDto.isOffline;
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
    if (updateAccountDto.logoutButton !== undefined) {
      account.logoutButton = updateAccountDto.logoutButton;
    }
    if (updateAccountDto.appConfiguration !== undefined) {
      account.appConfiguration = updateAccountDto.appConfiguration;
    }

    await this.teamsRepository.save(account.teams);
    const saved = await this.accountsRepository.save(account);
    saved.teams = account.teams;
    await this.recordUserEnabled(callerId, saved.id, enabledReasons);
    return this.toResponse(saved);
  }

  async updateTeam(
    callerId: string,
    accountId: string,
    teamId: string,
    patchTeamDto: PatchTeamDto,
  ): Promise<TeamItemResponse> {
    const caller = await this.getEntityOrFail(callerId);
    const account = await this.getEntityOrFail(accountId);
    const team = this.requireTeamById(account, teamId);
    this.assertCanEditAccount(caller, account, {
      teams: [{ teamNumber: team.teamNumber, ...patchTeamDto }],
    });
    await this.applyTeamUpdate(team, patchTeamDto);
    await this.teamsRepository.save(team);
    if (patchTeamDto.isLoginDisabled === false) {
      await this.recordUserEnabled(callerId, account.id, [
        patchTeamDto.reason!,
      ]);
    }
    return { team: this.toTeamResponse(team) };
  }

  /**
   * Blocks only the team bound to this device MAC (systemAddress) from
   * authenticating. Other teams on the same account stay usable.
   */
  async disableTeamLoginByAddress(
    accountId: string,
    ipAddress: string,
  ): Promise<void> {
    const account = await this.getEntityOrFail(accountId);
    const team = this.findTeamBySystemAddress(account, ipAddress);
    if (!team || team.isLoginDisabled) {
      return;
    }
    team.isLoginDisabled = true;
    await this.teamsRepository.save(team);
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
    admin = false,
  ): Promise<CheckPhoneResult> {
    const account = await this.findAccountByPhone(phoneNumber);

    if (!account) {
      return { exists: false, needsPassword: false };
    }

    await this.entitlementsService.assertElectronLoginAllowed(
      account.role,
      admin,
    );

    if (admin) {
      const hasPassword = account.teams.some(
        (team) => team.passwordHash && !team.setPassword,
      );
      return { exists: true, needsPassword: !hasPassword, role: account.role };
    }

    const matched = this.findTeamBySystemAddress(account, ipAddress ?? null);
    if (matched) {
      if (matched.isLoginDisabled) {
        throw new ForbiddenException(LOGIN_DISABLED_MESSAGE);
      }
      return {
        exists: true,
        needsPassword: matched.setPassword || !matched.passwordHash,
        role: account.role,
      };
    }

    const unbound = account.teams.find(
      (team) => !team.systemAddress && !team.isLoginDisabled,
    );
    if (unbound) {
      return {
        exists: true,
        needsPassword: unbound.setPassword || !unbound.passwordHash,
        role: account.role,
      };
    }

    if (account.teams.length >= this.maxTeams(account)) {
      throw new ForbiddenException(SYSTEM_ADDRESS_LIMIT_MESSAGE);
    }

    return { exists: true, needsPassword: true, role: account.role };
  }

  async setPassword(
    setPasswordDto: SetPasswordDto,
    ipAddress?: string | null,
  ): Promise<SetPasswordResponse> {
    const account = await this.findAccountByPhone(setPasswordDto.phoneNumber);
    if (!account) {
      throw new NotFoundException('User not found');
    }

    const resolvedIp = setPasswordDto.ipAddress ?? ipAddress ?? null;
    const team = await this.getOrCreateTeamForDevice(
      account,
      resolvedIp,
      'set-password',
    );
    if (team.isLoginDisabled) {
      throw new ForbiddenException(LOGIN_DISABLED_MESSAGE);
    }

    team.passwordHash = await hashPassword(setPasswordDto.password);
    team.setPassword = false;
    if (resolvedIp) {
      team.systemAddress = resolvedIp;
    }
    if (setPasswordDto.metadata !== undefined) {
      team.metadata = setPasswordDto.metadata;
    }
    await this.teamsRepository.save(team);

    return {
      ...this.toResponse(account),
      teamNumber: team.teamNumber,
    };
  }

  async remove(callerId: string, id: string): Promise<void> {
    const caller = await this.getEntityOrFail(callerId);
    const account = await this.getEntityOrFail(id);
    authorizeDeleteAccount(caller, account);
    await this.accountsRepository.delete(id);
  }

  async login(
    loginDto: LoginDto,
    ipAddress?: string | null,
    admin = false,
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

    await this.entitlementsService.assertElectronLoginAllowed(
      account.role,
      admin,
    );

    const team = admin
      ? await this.authenticateAdminTeam(account, loginDto, resolvedIp)
      : await this.authenticateDeviceTeam(account, loginDto, resolvedIp);

    await this.loginProtection.clear(loginDto.phoneNumber);

    team.lastLoginTime = new Date();
    await this.teamsRepository.save(team);

    const { teams: _teams, ...accountWithoutTeams } = this.toResponse(account);
    void _teams;
    return {
      account: accountWithoutTeams,
      team: this.toTeamResponse(team),
      token: await this.jweService.encryptAccountToken(account.id, admin),
    };
  }

  // Builds an .xlsx workbook containing only the header row, for the user to
  // fill in and upload back.
  async generateTemplate(): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet(TEMPLATE_SHEET_NAME);

    sheet.columns = CREATE_TEMPLATE_COLUMNS.map((column) => ({
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

    const role = parseAccountRole(values.role);

    const country = this.resolveCountry(values);

    const numberOfTeams = this.parseOptionalPositiveInt(
      values.numberOfTeams,
      'No. of Teams Expected',
    );
    const numberOfReboot = this.parseOptionalNonNegativeInt(
      values.numberOfReboot,
      'No. of Reboot',
    );
    const appConfiguration = this.parseOptionalPositiveInt(
      values.appConfiguration,
      'App Configuration',
    );
    const logoutButton = this.parseOptionalBoolean(
      values.logoutButton,
      'Logout Button',
    );
    const isOffline = this.parseOptionalBoolean(values.isOffline, 'Is Offline');
    const kendraType = values.kendraType?.trim();
    const source = values.source?.trim();
    const metadata =
      kendraType || source
        ? {
            ...(kendraType ? { kendraType } : {}),
            ...(source ? { source } : {}),
          }
        : undefined;

    await this.create({
      phoneNumber,
      role,
      isOffline,
      country,
      sanghat: values.sanghat?.trim() || undefined,
      jilha: values.jilha?.trim() || undefined,
      taluka: values.taluka?.trim() || undefined,
      group: values.group?.trim() || undefined,
      kendra: values.kendra?.trim() || undefined,
      sanchalakName: values.sanchalakName?.trim() || undefined,
      numberOfTeams,
      numberOfReboot,
      logoutButton,
      appConfiguration,
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

  private parseOptionalNonNegativeInt(
    raw: string | undefined,
    fieldName: string,
  ): number | undefined {
    const value = raw?.trim().replace(/\.0$/, '');
    if (!value) {
      return undefined;
    }
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 0) {
      throw new Error(`${fieldName} must be an integer >= 0`);
    }
    return parsed;
  }

  private parseOptionalBoolean(
    raw: string | undefined,
    fieldName: string,
  ): boolean | undefined {
    const value = raw?.trim().toLowerCase();
    if (!value) {
      return undefined;
    }
    if (['true', 'yes', '1', 'y'].includes(value)) {
      return true;
    }
    if (['false', 'no', '0', 'n'].includes(value)) {
      return false;
    }
    throw new Error(`${fieldName} must be true or false`);
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

  private requireTeam(account: Account, teamNumber: number): Team {
    const team = account.teams.find((item) => item.teamNumber === teamNumber);
    if (!team) {
      throw new NotFoundException(`Team ${teamNumber} not found`);
    }
    return team;
  }

  private requireTeamById(account: Account, teamId: string): Team {
    const team = account.teams.find((item) => item.id === teamId);
    if (!team) {
      throw new NotFoundException(`Team ${teamId} not found`);
    }
    return team;
  }

  private clearTeamPassword(team: Team): void {
    team.passwordHash = null;
    team.setPassword = true;
    team.systemAddress = null;
  }

  private async applyTeamUpdate(
    team: Team,
    update: Pick<UpdateTeamDto, 'setPassword' | 'isLoginDisabled' | 'password'>,
  ): Promise<void> {
    if (
      update.setPassword === undefined &&
      update.isLoginDisabled === undefined &&
      update.password === undefined
    ) {
      throw new BadRequestException('No team fields to update');
    }
    if (update.password !== undefined && update.setPassword === true) {
      throw new BadRequestException(
        'Cannot set a password and setPassword=true in the same request',
      );
    }
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

  private async applyTeamUpdates(
    account: Account,
    updates: UpdateTeamDto[],
  ): Promise<string[]> {
    const enabledReasons: string[] = [];
    for (const update of updates) {
      const team = this.requireTeam(account, update.teamNumber);
      await this.applyTeamUpdate(team, update);
      if (update.isLoginDisabled === false) {
        enabledReasons.push(update.reason!);
      }
    }
    return enabledReasons;
  }

  private async recordUserEnabled(
    callerId: string,
    targetAccountId: string,
    reasons: string[],
  ): Promise<void> {
    for (const reason of reasons) {
      await this.auditTrailService.create(callerId, {
        event: USER_ENABLED_EVENT,
        message: reason,
        targetAccountId,
      });
    }
  }

  private async syncTeamCount(
    account: Account,
    newCount: number,
  ): Promise<void> {
    const registered = account.teams.filter(
      (team) => team.systemAddress || team.passwordHash,
    );
    if (registered.length > newCount) {
      throw new BadRequestException(
        `numberOfTeams cannot be less than the ${registered.length} registered team(s)`,
      );
    }

    const toRemove = account.teams.filter(
      (team) =>
        team.teamNumber > newCount && !team.systemAddress && !team.passwordHash,
    );
    if (toRemove.length === 0) {
      return;
    }

    account.teams = account.teams.filter(
      (team) => !toRemove.some((item) => item === team),
    );
    const persisted = toRemove.filter((team) => team.id);
    if (persisted.length > 0) {
      await this.teamsRepository.remove(persisted);
    }
  }

  private async authenticateDeviceTeam(
    account: Account,
    loginDto: LoginDto,
    resolvedIp: string | null,
  ): Promise<Team> {
    const team = await this.getOrCreateTeamForDevice(
      account,
      resolvedIp,
      'login',
    );
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

    this.bindTeamOnLogin(team, resolvedIp);
    return team;
  }

  /** Admin UI: match any team by password, ignore device MAC / team limits. */
  private async authenticateAdminTeam(
    account: Account,
    loginDto: LoginDto,
    resolvedIp: string | null,
  ): Promise<Team> {
    const candidates = account.teams.filter(
      (team) => team.passwordHash && !team.setPassword,
    );
    for (const team of candidates) {
      const passwordMatches = await this.passwordVerification.verify(
        loginDto.password,
        team.passwordHash!,
      );
      if (passwordMatches) {
        return team;
      }
    }

    await this.loginProtection.recordFailure(loginDto.phoneNumber, resolvedIp);
    throw new UnauthorizedException(
      'Invalid credentials. If you have forgotten your password, please contact your Jababdar Bhai.',
    );
  }

  private findTeamBySystemAddress(
    account: Account,
    ip: string | null,
  ): Team | undefined {
    if (!ip) {
      return undefined;
    }
    const normalized = ip.trim().toLowerCase();
    return account.teams.find(
      (team) => team.systemAddress?.trim().toLowerCase() === normalized,
    );
  }

  // Teams are created when a new device IP first calls set-password,
  // not when the account is created.
  private async getOrCreateTeamForDevice(
    account: Account,
    ip: string | null,
    mode: 'login' | 'set-password',
  ): Promise<Team> {
    const matched = this.findTeamBySystemAddress(account, ip);
    if (matched) {
      return matched;
    }

    const unbound = account.teams.find(
      (team) => !team.systemAddress && !team.isLoginDisabled,
    );
    if (unbound) {
      return unbound;
    }

    if (account.teams.length >= this.maxTeams(account)) {
      throw new ForbiddenException(
        mode === 'set-password'
          ? SYSTEM_ADDRESS_SET_PASSWORD_LIMIT_MESSAGE
          : SYSTEM_ADDRESS_LIMIT_MESSAGE,
      );
    }

    if (mode === 'login') {
      throw new UnauthorizedException('Invalid credentials');
    }

    return this.createTeamForDevice(account, ip);
  }

  private async createTeamForDevice(
    account: Account,
    ip: string | null,
  ): Promise<Team> {
    const teamNumber =
      account.teams.reduce((max, team) => Math.max(max, team.teamNumber), 0) +
      1;
    const team = this.teamsRepository.create({
      accountId: account.id,
      teamNumber,
      passwordHash: null,
      setPassword: true,
      systemAddress: ip,
      metadata: null,
      isLoginDisabled: false,
      lastLoginTime: null,
    });
    const saved = await this.teamsRepository.save(team);
    account.teams.push(saved);
    return saved;
  }

  private bindTeamOnLogin(team: Team, ip: string | null): void {
    if (!ip || team.systemAddress) {
      return;
    }
    team.systemAddress = ip;
  }

  private toBulkAccountSet(dto: BulkUpdateFlagsDto): {
    logoutButton?: boolean;
    appConfiguration?: number;
    numberOfReboot?: number;
    isOffline?: boolean;
  } {
    const accountSet: {
      logoutButton?: boolean;
      appConfiguration?: number;
      numberOfReboot?: number;
      isOffline?: boolean;
    } = {};
    if (dto.logoutButton !== undefined) {
      accountSet.logoutButton = dto.logoutButton;
    }
    if (dto.appConfiguration !== undefined) {
      accountSet.appConfiguration = dto.appConfiguration;
    }
    if (dto.numberOfReboot !== undefined) {
      accountSet.numberOfReboot = dto.numberOfReboot;
    }
    if (dto.isOffline !== undefined) {
      accountSet.isOffline = dto.isOffline;
    }
    return accountSet;
  }

  private async loadBulkFlagBatch(
    sanghat: string | null,
    afterId: string | null,
  ): Promise<Account[]> {
    const qb = this.accountsRepository
      .createQueryBuilder('account')
      .orderBy('account.id', 'ASC')
      .take(BULK_FLAGS_BATCH_SIZE);
    if (sanghat) {
      qb.andWhere('LOWER(BTRIM(account.sanghat)) = LOWER(BTRIM(:sanghat))', {
        sanghat,
      });
    }
    if (afterId) {
      qb.andWhere('account.id > :afterId', { afterId });
    }
    return qb.getMany();
  }

  private planBulkFlagUpdates(
    accounts: Account[],
    dto: BulkUpdateFlagsDto,
    accountSet: {
      logoutButton?: boolean;
      appConfiguration?: number;
      numberOfReboot?: number;
      isOffline?: boolean;
    },
    hasAccountFlags: boolean,
    hasTeamFlags: boolean,
  ): {
    changedAccountIds: Set<string>;
    accountIdsToUpdate: string[];
    teamIdsToUpdate: string[];
    errors: BulkUpdateFlagsError[];
  } {
    const errors: BulkUpdateFlagsError[] = [];
    const changedAccountIds = new Set<string>();
    const accountIdsToUpdate: string[] = [];
    const teamIdsToUpdate: string[] = [];

    for (const account of accounts) {
      if (hasAccountFlags) {
        const unchanged: string[] = [];
        let needsUpdate = false;
        for (const [field, value] of Object.entries(accountSet) as Array<
          [keyof typeof accountSet, boolean | number]
        >) {
          if (account[field] === value) {
            unchanged.push(field);
          } else {
            needsUpdate = true;
          }
        }
        if (needsUpdate) {
          accountIdsToUpdate.push(account.id);
          changedAccountIds.add(account.id);
        }
        if (unchanged.length > 0) {
          errors.push(
            this.toBulkFlagError(
              account,
              null,
              unchanged,
              UNCHANGED_VALUE_ERROR,
            ),
          );
        }
      }

      if (!hasTeamFlags) {
        continue;
      }

      if (account.teams.length === 0) {
        const fields = [
          ...(dto.isLoginDisabled !== undefined ? ['isLoginDisabled'] : []),
          ...(dto.setPassword === true ? ['setPassword'] : []),
        ];
        errors.push(
          this.toBulkFlagError(account, null, fields, 'no teams to update'),
        );
        continue;
      }

      for (const team of account.teams) {
        const unchanged: string[] = [];
        let needsUpdate = false;
        if (dto.isLoginDisabled !== undefined) {
          if (team.isLoginDisabled === dto.isLoginDisabled) {
            unchanged.push('isLoginDisabled');
          } else {
            needsUpdate = true;
          }
        }
        if (dto.setPassword === true) {
          const alreadyReset =
            team.setPassword === true &&
            !team.passwordHash &&
            !team.systemAddress;
          if (alreadyReset) {
            unchanged.push('setPassword');
          } else {
            needsUpdate = true;
          }
        }
        if (needsUpdate) {
          teamIdsToUpdate.push(team.id);
          changedAccountIds.add(account.id);
        }
        if (unchanged.length > 0) {
          errors.push(
            this.toBulkFlagError(
              account,
              team.teamNumber,
              unchanged,
              UNCHANGED_VALUE_ERROR,
            ),
          );
        }
      }
    }

    return {
      changedAccountIds,
      accountIdsToUpdate,
      teamIdsToUpdate,
      errors,
    };
  }

  private async applyBulkFlagUpdates(
    accountSet: {
      logoutButton?: boolean;
      appConfiguration?: number;
      numberOfReboot?: number;
      isOffline?: boolean;
    },
    dto: BulkUpdateFlagsDto,
    planned: {
      accountIdsToUpdate: string[];
      teamIdsToUpdate: string[];
    },
  ): Promise<void> {
    await this.accountsRepository.manager.transaction(async (manager) => {
      if (planned.accountIdsToUpdate.length > 0) {
        await manager
          .createQueryBuilder()
          .update(Account)
          .set(accountSet)
          .whereInIds(planned.accountIdsToUpdate)
          .execute();
      }
      if (planned.teamIdsToUpdate.length > 0) {
        const teamSet: {
          isLoginDisabled?: boolean;
          setPassword?: boolean;
          passwordHash?: () => string;
          systemAddress?: () => string;
        } = {};
        if (dto.isLoginDisabled !== undefined) {
          teamSet.isLoginDisabled = dto.isLoginDisabled;
        }
        if (dto.setPassword === true) {
          teamSet.setPassword = true;
          teamSet.passwordHash = () => 'NULL';
          teamSet.systemAddress = () => 'NULL';
        }
        await manager
          .createQueryBuilder()
          .update(Team)
          .set(teamSet)
          .whereInIds(planned.teamIdsToUpdate)
          .execute();
      }
    });
  }

  private toBulkFlagError(
    account: Account,
    teamNumber: number | null,
    fields: string[],
    error: string,
  ): BulkUpdateFlagsError {
    return {
      phoneNumber: account.phoneNumber,
      kendra: account.kendra,
      sanghat: account.sanghat,
      teamNumber,
      fields,
      error,
    };
  }

  private toBulkFlagsMeta(dto: BulkUpdateFlagsDto): Record<string, unknown> {
    const flags: Record<string, unknown> = {};
    if (dto.logoutButton !== undefined) {
      flags.logoutButton = dto.logoutButton;
    }
    if (dto.appConfiguration !== undefined) {
      flags.appConfiguration = dto.appConfiguration;
    }
    if (dto.numberOfReboot !== undefined) {
      flags.numberOfReboot = dto.numberOfReboot;
    }
    if (dto.isOffline !== undefined) {
      flags.isOffline = dto.isOffline;
    }
    if (dto.isLoginDisabled !== undefined) {
      flags.isLoginDisabled = dto.isLoginDisabled;
    }
    if (dto.setPassword === true) {
      flags.setPassword = true;
    }
    return flags;
  }

  private toTeamResponse(team: Team): TeamResponse {
    const { passwordHash, account: teamAccount, ...rest } = team;
    void passwordHash;
    void teamAccount;
    return rest;
  }

  private toTeamsResponse(teams: Team[] | undefined): TeamsResponse {
    return {
      teams: [...(teams ?? [])]
        .sort((a, b) => a.teamNumber - b.teamNumber)
        .map((team) => this.toTeamResponse(team)),
    };
  }

  private toResponse(account: Account): AccountResponse {
    const { teams: _teams, ...rest } = account;
    void _teams;
    return { ...rest, ...this.toTeamsResponse(account.teams) };
  }
}
