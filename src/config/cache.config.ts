import { CacheModuleOptions } from '@nestjs/cache-manager';

/** 1 day in milliseconds (cache-manager v5+ uses ms). */
export const CACHE_TTL_ONE_DAY_MS = 86_400_000;
/** Login analytics: 3 hours in process memory per sanghat + since key. */
export const CACHE_TTL_LOGIN_ANALYTICS_MS = 10_800_000;

export const videoCacheKeys = {
  all: 'videos:all',
  one: (videoId: string) => `videos:${videoId}`,
} as const;

export const loginAnalyticsCacheKeys = {
  one: (sanghat: string, since: string) =>
    `login-analytics:${sanghat}:${since}`,
} as const;

export const videoSegmentCacheKeys = {
  one: (videoId: string, segmentNumber: number) =>
    `video-segments:${videoId}:${segmentNumber}`,
} as const;

export const buildCacheConfig = (): CacheModuleOptions => ({
  ttl: CACHE_TTL_ONE_DAY_MS,
});
