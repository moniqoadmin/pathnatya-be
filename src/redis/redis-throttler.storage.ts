import { Injectable, Logger } from '@nestjs/common';
import { ThrottlerStorage } from '@nestjs/throttler';
import { ThrottlerStorageRecord } from '@nestjs/throttler/dist/throttler-storage-record.interface';
import { RedisService } from './redis.service';

const INCREMENT_SCRIPT = `
local hits = redis.call('INCR', KEYS[1])
if hits == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
local ttl = redis.call('PTTL', KEYS[1])
local blocked = 0
local blockTtl = 0
if hits > tonumber(ARGV[2]) then
  blocked = 1
  redis.call('SET', KEYS[2], '1', 'PX', ARGV[3])
  blockTtl = tonumber(ARGV[3])
else
  blockTtl = redis.call('PTTL', KEYS[2])
  if blockTtl > 0 then blocked = 1 end
end
return {hits, ttl, blocked, blockTtl}
`;

@Injectable()
export class RedisThrottlerStorage implements ThrottlerStorage {
  private readonly logger = new Logger(RedisThrottlerStorage.name);

  constructor(private readonly redis: RedisService) {}

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    if (!this.redis.isConfigured()) {
      return this.allowRecord(ttl);
    }

    try {
      const client = await this.redis.ensureConnected();
      const prefix = `throttle:${throttlerName}:${key}`;
      const result = (await client.eval(
        INCREMENT_SCRIPT,
        2,
        prefix,
        `${prefix}:blocked`,
        ttl,
        limit,
        blockDuration || ttl,
      )) as number[];
      return {
        totalHits: Number(result[0]),
        timeToExpire: Math.max(0, Math.ceil(Number(result[1]) / 1000)),
        isBlocked: Number(result[2]) === 1,
        timeToBlockExpire: Math.max(0, Math.ceil(Number(result[3]) / 1000)),
      };
    } catch (error) {
      this.logger.warn(
        `Redis throttling unavailable; failing open: ${(error as Error).message}`,
      );
      return this.allowRecord(ttl);
    }
  }

  private allowRecord(ttl: number): ThrottlerStorageRecord {
    return {
      totalHits: 1,
      timeToExpire: Math.ceil(ttl / 1000),
      isBlocked: false,
      timeToBlockExpire: 0,
    };
  }
}
