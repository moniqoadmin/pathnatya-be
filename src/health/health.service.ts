import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

@Injectable()
export class HealthService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async check() {
    let database = 'down';
    try {
      await this.dataSource.query('SELECT 1');
      database = 'up';
    } catch {
      database = 'down';
    }

    return {
      status: database === 'up' ? 'ok' : 'down',
      database,
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
