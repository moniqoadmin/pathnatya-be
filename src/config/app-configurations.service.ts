import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';
import { Account } from '../accounts/entities/account.entity';
import { UpdateAppConfigurationDto } from './dto/update-app-configuration.dto';
import { UpsertAppConfigurationDto } from './dto/upsert-app-configuration.dto';
import { AppConfiguration } from './entities/app-configuration.entity';

@Injectable()
export class AppConfigurationsService {
  constructor(
    @InjectRepository(AppConfiguration)
    private readonly repository: Repository<AppConfiguration>,
  ) {}

  findAll(): Promise<AppConfiguration[]> {
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
}
