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
import { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';
import { Account, AccountRole } from '../accounts/entities/account.entity';
import { UpdateAppConfigurationDto } from './dto/update-app-configuration.dto';
import { UpsertAppConfigurationDto } from './dto/upsert-app-configuration.dto';
import { AppConfiguration } from './entities/app-configuration.entity';

const ADMIN_LIST_ROLES: ReadonlySet<AccountRole> = new Set([
  AccountRole.SUPER_ADMIN,
  AccountRole.DEVELOPER,
]);

@Injectable()
export class AppConfigurationsService {
  constructor(
    @InjectRepository(AppConfiguration)
    private readonly repository: Repository<AppConfiguration>,
    @InjectRepository(Account)
    private readonly accountsRepository: Repository<Account>,
  ) {}

  async findAll(
    callerId: string,
    adminQuery: boolean,
  ): Promise<AppConfiguration[]> {
    if (adminQuery) {
      await this.assertAdminListAccess(callerId);
    }
    return this.repository.find({ order: { id: 'ASC' } });
  }

  async findOne(id: number): Promise<AppConfiguration> {
    const configuration = await this.repository.findOne({ where: { id } });
    if (!configuration) {
      throw new NotFoundException(`App configuration ${id} not found`);
    }
    return configuration;
  }

  async upsert(dto: UpsertAppConfigurationDto): Promise<AppConfiguration> {
    await this.repository.upsert(
      {
        id: dto.id,
        videoConfig: dto.videoConfig,
        videoFiles: dto.videoFiles,
      } as QueryDeepPartialEntity<AppConfiguration>,
      ['id'],
    );

    return this.findOne(dto.id);
  }

  async update(
    id: number,
    dto: UpdateAppConfigurationDto,
  ): Promise<AppConfiguration> {
    if (
      dto.id === undefined &&
      dto.videoConfig === undefined &&
      dto.videoFiles === undefined
    ) {
      throw new BadRequestException('Provide id, videoConfig, and/or videoFiles');
    }

    const configuration = await this.findOne(id);
    const nextId = dto.id ?? id;

    if (nextId === id) {
      if (dto.videoConfig !== undefined) {
        configuration.videoConfig = dto.videoConfig;
      }
      if (dto.videoFiles !== undefined) {
        configuration.videoFiles = dto.videoFiles;
      }
      return this.repository.save(configuration);
    }

    const taken = await this.repository.findOne({ where: { id: nextId } });
    if (taken) {
      throw new ConflictException(`App configuration ${nextId} already exists`);
    }

    await this.repository.manager.transaction(async (manager) => {
      await manager.insert(AppConfiguration, {
        id: nextId,
        videoConfig: dto.videoConfig ?? configuration.videoConfig,
        videoFiles: dto.videoFiles ?? configuration.videoFiles,
      } as QueryDeepPartialEntity<AppConfiguration>);
      await manager.update(
        Account,
        { appConfiguration: id },
        { appConfiguration: nextId },
      );
      await manager.delete(AppConfiguration, { id });
    });

    return this.findOne(nextId);
  }

  private async assertAdminListAccess(callerId: string): Promise<void> {
    const account = await this.accountsRepository.findOne({
      where: { id: callerId },
      select: ['id', 'role'],
    });
    if (!account) {
      throw new UnauthorizedException('Invalid or expired token');
    }
    if (!ADMIN_LIST_ROLES.has(account.role)) {
      throw new ForbiddenException('Your account cannot perform this action');
    }
  }
}
