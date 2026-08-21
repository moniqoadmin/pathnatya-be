import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { AccountRole } from '../accounts/entities/account.entity';
import { AuditTrailService } from '../audit-trail/audit-trail.service';
import { CreateEntitlementDto } from './dto/create-entitlement.dto';
import { UpdateEntitlementDto } from './dto/update-entitlement.dto';
import { Entitlement } from './entities/entitlement.entity';
import {
  ADMIN_LOGIN_ELECTRON_APP,
  DEFAULT_ENTITLEMENTS,
  SHOW_ANALYTICS,
} from './entitlements.constants';
import { isPrivilegedElectronLoginBlocked } from './entitlements.policy';

export const ENTITLEMENT_CREATED_EVENT = 'ENTITLEMENT_CREATED';
export const ENTITLEMENT_UPDATED_EVENT = 'ENTITLEMENT_UPDATED';

const ELECTRON_PRIVILEGED_LOGIN_BLOCKED_MESSAGE =
  'Admin, SuperAdmin, and Developer accounts cannot log in from the Electron app.';

const ANALYTICS_DISABLED_MESSAGE =
  'Login analytics are disabled. Enable the SHOW_ANALYTICS entitlement to use them.';

const PG_UNIQUE_VIOLATION = '23505';

@Injectable()
export class EntitlementsService implements OnModuleInit {
  constructor(
    @InjectRepository(Entitlement)
    private readonly repository: Repository<Entitlement>,
    private readonly auditTrailService: AuditTrailService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.seedDefaults();
  }

  async seedDefaults(): Promise<void> {
    const existing = await this.repository.find({ select: ['key'] });
    const have = new Set(existing.map((row) => row.key));
    const missing = DEFAULT_ENTITLEMENTS.filter((item) => !have.has(item.key));
    if (missing.length === 0) {
      return;
    }

    try {
      await this.repository.save(
        missing.map((item) => this.repository.create(item)),
      );
    } catch (error) {
      if (!this.isUniqueViolation(error)) {
        throw error;
      }
    }
  }

  findAll(): Promise<Entitlement[]> {
    return this.repository.find({ order: { key: 'ASC' } });
  }

  async findOne(key: string): Promise<Entitlement> {
    const entitlement = await this.repository.findOne({ where: { key } });
    if (!entitlement) {
      throw new NotFoundException(`Entitlement ${key} not found`);
    }
    return entitlement;
  }

  async isEnabled(key: string): Promise<boolean> {
    const row = await this.repository.findOne({
      where: { key },
      select: ['key', 'enabled'],
    });
    if (row) {
      return row.enabled;
    }
    const fallback = DEFAULT_ENTITLEMENTS.find((item) => item.key === key);
    return fallback?.enabled ?? false;
  }

  async assertElectronLoginAllowed(
    role: AccountRole,
    adminQuery: boolean,
  ): Promise<void> {
    const allowed = await this.isEnabled(ADMIN_LOGIN_ELECTRON_APP);
    if (isPrivilegedElectronLoginBlocked(role, adminQuery, allowed)) {
      throw new ForbiddenException(ELECTRON_PRIVILEGED_LOGIN_BLOCKED_MESSAGE);
    }
  }

  async assertAnalyticsAllowed(): Promise<void> {
    const allowed = await this.isEnabled(SHOW_ANALYTICS);
    if (!allowed) {
      throw new ForbiddenException(ANALYTICS_DISABLED_MESSAGE);
    }
  }

  async create(
    callerId: string,
    dto: CreateEntitlementDto,
  ): Promise<Entitlement> {
    const existing = await this.repository.findOne({ where: { key: dto.key } });
    if (existing) {
      throw new ConflictException(`Entitlement ${dto.key} already exists`);
    }

    const saved = await this.repository.save(
      this.repository.create({
        key: dto.key,
        enabled: dto.enabled,
        description: dto.description ?? null,
        updatedBy: callerId,
      }),
    );

    await this.auditTrailService.create(callerId, {
      event: ENTITLEMENT_CREATED_EVENT,
      message: `Created entitlement ${saved.key} (${saved.enabled ? 'enabled' : 'disabled'})`,
      metaData: {
        key: saved.key,
        enabled: saved.enabled,
        description: saved.description,
      },
    });

    return saved;
  }

  async update(
    callerId: string,
    key: string,
    dto: UpdateEntitlementDto,
  ): Promise<Entitlement> {
    const entitlement = await this.findOne(key);
    const previousEnabled = entitlement.enabled;
    const previousDescription = entitlement.description;
    const nextDescription =
      dto.description === undefined ? entitlement.description : dto.description;

    if (
      previousEnabled === dto.enabled &&
      previousDescription === nextDescription
    ) {
      return entitlement;
    }

    entitlement.enabled = dto.enabled;
    entitlement.description = nextDescription;
    entitlement.updatedBy = callerId;
    const saved = await this.repository.save(entitlement);

    await this.auditTrailService.create(callerId, {
      event: ENTITLEMENT_UPDATED_EVENT,
      message: `Set entitlement ${saved.key} from ${previousEnabled} to ${saved.enabled}`,
      metaData: {
        key: saved.key,
        previousEnabled,
        enabled: saved.enabled,
        previousDescription,
        description: saved.description,
      },
    });

    return saved;
  }

  private isUniqueViolation(error: unknown): boolean {
    return (
      error instanceof QueryFailedError &&
      typeof error.driverError === 'object' &&
      error.driverError !== null &&
      'code' in error.driverError &&
      error.driverError.code === PG_UNIQUE_VIOLATION
    );
  }
}
