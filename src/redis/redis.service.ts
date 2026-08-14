import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private readonly client: Redis | null;

  constructor(config: ConfigService) {
    const url = config.get<string>('REDIS_URL')?.trim();
    if (!url) {
      this.client = null;
      this.logger.warn('REDIS_URL is not configured');
      return;
    }

    this.client = new Redis(url, {
      connectTimeout: 5_000,
      maxRetriesPerRequest: null,
      retryStrategy: (attempt) =>
        attempt > 5 ? null : Math.min(attempt * 200, 1_000),
      lazyConnect: true,
    });
    this.client.on('error', (error) =>
      this.logger.warn(`Redis error: ${error.message}`),
    );
  }

  isConfigured(): boolean {
    return this.client !== null;
  }

  getClient(): Redis {
    if (!this.client) {
      throw new Error('REDIS_URL is not configured');
    }
    return this.client;
  }

  async ensureConnected(): Promise<Redis> {
    const client = this.getClient();
    if (client.status === 'wait') {
      await client.connect();
    }
    return client;
  }

  async ping(): Promise<boolean> {
    if (!this.client) return false;
    try {
      const client = await this.ensureConnected();
      return (await client.ping()) === 'PONG';
    } catch {
      return false;
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (!this.client || this.client.status === 'end') return;
    await this.client.quit().catch(() => this.client?.disconnect());
  }
}
