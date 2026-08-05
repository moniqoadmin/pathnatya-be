import { CacheModuleOptions } from '@nestjs/cache-manager';
import { ConfigService } from '@nestjs/config';
import { createKeyv } from '@keyv/redis';

/** 1 day in milliseconds (cache-manager v5+ uses ms). */
export const CACHE_TTL_ONE_DAY_MS = 86_400_000;

export const videoCacheKeys = {
  all: 'videos:all',
  one: (videoId: string) => `videos:${videoId}`,
} as const;

export const videoSegmentCacheKeys = {
  one: (videoId: string, segmentNumber: number) =>
    `video-segments:${videoId}:${segmentNumber}`,
} as const;

export const buildCacheConfig = (
  config: ConfigService,
): CacheModuleOptions => {
  const getEnv = (key: string): string | undefined =>
    process.env[key] ?? config.get<string>(key);

  const redisUrl = getEnv('REDIS_URL') ?? 'redis://localhost:6379';

  return {
    stores: [createKeyv(redisUrl)],
    ttl: CACHE_TTL_ONE_DAY_MS,
  };
};
