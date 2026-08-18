import { Inject, Injectable, Logger } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';

/**
 * Thin cache wrapper that never blocks the request path.
 * Cache errors degrade to misses so reads still hit the database.
 */
@Injectable()
export class AppCacheService {
  private readonly logger = new Logger(AppCacheService.name);

  constructor(@Inject(CACHE_MANAGER) private readonly cache: Cache) {}

  async get<T>(key: string): Promise<T | undefined> {
    try {
      return await this.cache.get<T>(key);
    } catch (error) {
      this.logger.warn(
        `cache.get(${key}) failed: ${error instanceof Error ? error.message : error}`,
      );
      return undefined;
    }
  }

  async set(key: string, value: unknown, ttlMs: number): Promise<void> {
    try {
      await this.cache.set(key, value, ttlMs);
    } catch (error) {
      this.logger.warn(
        `cache.set(${key}) failed: ${error instanceof Error ? error.message : error}`,
      );
    }
  }

  async del(key: string): Promise<void> {
    try {
      await this.cache.del(key);
    } catch (error) {
      this.logger.warn(
        `cache.del(${key}) failed: ${error instanceof Error ? error.message : error}`,
      );
    }
  }
}
