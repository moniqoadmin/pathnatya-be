import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ServerApiUrl } from './entities/server-api-url.entity';

@Injectable()
export class ServerApiUrlsService {
  constructor(
    @InjectRepository(ServerApiUrl)
    private readonly repository: Repository<ServerApiUrl>,
  ) {}

  findAll(): Promise<ServerApiUrl[]> {
    return this.repository.find({ order: { id: 'ASC' } });
  }

  async upsert(id: number, link: string): Promise<ServerApiUrl> {
    const entity = this.repository.create({ id, link });
    await this.repository.save(entity);
    return entity;
  }
}
