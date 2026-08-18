import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';
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

  async upsert(dto: UpsertAppConfigurationDto): Promise<AppConfiguration> {
    await this.repository.upsert(
      {
        id: dto.id,
        videoConfig: dto.videoConfig,
        videoFiles: dto.videoFiles,
      } as QueryDeepPartialEntity<AppConfiguration>,
      ['id'],
    );

    return this.repository.findOneByOrFail({ id: dto.id });
  }
}
