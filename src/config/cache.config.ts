import { Logger } from '@nestjs/common';
import { CacheModuleOptions } from '@nestjs/cache-manager';
import { ConfigService } from '@nestjs/config';
import { createKeyv } from '@keyv/redis';
import { Keyv } from 'keyv';

/** 1 day in milliseconds (cache-manager v5+ uses ms). */
export const CACHE_TTL_ONE_DAY_MS = 86_400_000;

const REDIS_CONNECT_TIMEOUT_MS = 5_000;

const logger = new Logger('CacheConfig');

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

  const redisUrl = getEnv('REDIS_URL')?.trim();

  if (!redisUrl) {
    logger.warn(
      'REDIS_URL is not set — using in-memory cache. Set REDIS_URL to your hosted Redis (use rediss:// for TLS).',
    );
    return {
      stores: [new Keyv({ namespace: 'pathnatya' })],
      ttl: CACHE_TTL_ONE_DAY_MS,
    };
  }

  logger.log(`Using Redis cache at ${sanitizeRedisUrl(redisUrl)}`);

  const store = createKeyv(
    {
      url: redisUrl,
      socket: {
        connectTimeout: REDIS_CONNECT_TIMEOUT_MS,
        reconnectStrategy: (retries: number) => {
          if (retries > 3) {
            return new Error('Redis reconnect limit reached');
          }
          return Math.min(retries * 200, 1_000);
        },
      },
    },
    {
      namespace: 'pathnatya',
      connectionTimeout: REDIS_CONNECT_TIMEOUT_MS,
      throwOnConnectError: false,
      throwOnErrors: false,
    },
  );

  store.on('error', (error: Error) => {
    logger.warn(`Redis cache error: ${error.message}`);
  });

  return {
    stores: [store],
    ttl: CACHE_TTL_ONE_DAY_MS,
  };
};

/** Hide password when logging the Redis URL. */
function sanitizeRedisUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.password) {
      parsed.password = '***';
    }
    return parsed.toString();
  } catch {
    return '[invalid REDIS_URL]';
  }
}
