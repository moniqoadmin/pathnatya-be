import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { RedisService } from '../redis/redis.service';

@Injectable()
export class HealthService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly redis: RedisService,
  ) {}

  async check() {
    let database = 'down';
    try {
      await this.dataSource.query('SELECT 1');
      database = 'up';
    } catch {
      database = 'down';
    }

    const redis = (await this.redis.ping()) ? 'up' : 'down';

    return {
      status:
        database === 'up' && redis === 'up'
          ? 'ok'
          : database === 'up'
            ? 'degraded'
            : 'down',
      database,
      redis,
      timestamp: new Date().toISOString(),
    };
  }

  now() {
    const now = new Date();
    return {
      iso: now.toISOString(),
      unixMs: now.getTime(),
    };
  }
}
