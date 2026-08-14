import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import { RedisService } from '../redis/redis.service';

@Injectable()
export class LoginProtectionService {
  private readonly logger = new Logger(LoginProtectionService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly redis: RedisService,
  ) {}

  async assertAllowed(
    phoneNumber: string,
    ipAddress: string | null,
  ): Promise<void> {
    if (!this.redis.isConfigured()) return;
    try {
      const client = await this.redis.ensureConnected();
      const keys = [
        this.phoneKey(phoneNumber),
        ipAddress && this.ipKey(ipAddress),
      ].filter((value): value is string => !!value);
      for (const key of keys) {
        const ttl = await client.ttl(`${key}:blocked`);
        if (ttl > 0) this.throwLocked(ttl);
      }
    } catch (error) {
      if (error instanceof HttpException) throw error;
      this.logger.warn(
        `Login protection unavailable; failing open: ${(error as Error).message}`,
      );
    }
  }

  async recordFailure(
    phoneNumber: string,
    ipAddress: string | null,
  ): Promise<void> {
    if (!this.redis.isConfigured()) return;
    try {
      const client = await this.redis.ensureConnected();
      const windowSeconds = this.number('LOGIN_FAILURE_WINDOW_SECONDS', 900);
      const lockSeconds = this.number('LOGIN_LOCK_SECONDS', 900);
      const checks: Array<[string, number]> = [
        [
          this.phoneKey(phoneNumber),
          this.number('LOGIN_PHONE_FAILURE_LIMIT', 5),
        ],
      ];
      if (ipAddress) {
        checks.push([
          this.ipKey(ipAddress),
          this.number('LOGIN_IP_FAILURE_LIMIT', 100),
        ]);
      }

      for (const [key, limit] of checks) {
        const failures = await client.incr(`${key}:failures`);
        if (failures === 1)
          await client.expire(`${key}:failures`, windowSeconds);
        if (failures >= limit) {
          await client.set(`${key}:blocked`, '1', 'EX', lockSeconds);
        }
      }
    } catch (error) {
      this.logger.warn(
        `Could not record login failure: ${(error as Error).message}`,
      );
    }
  }

  async clear(phoneNumber: string): Promise<void> {
    if (!this.redis.isConfigured()) return;
    try {
      const client = await this.redis.ensureConnected();
      const key = this.phoneKey(phoneNumber);
      await client.del(`${key}:failures`, `${key}:blocked`);
    } catch (error) {
      this.logger.warn(
        `Could not clear login failures: ${(error as Error).message}`,
      );
    }
  }

  private throwLocked(retryAfterSeconds: number): never {
    throw new HttpException(
      {
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        message: 'Too many failed login attempts. Please try again later.',
        retryAfterSeconds,
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }

  private phoneKey(value: string): string {
    return `login:phone:${this.hash(value)}`;
  }

  private ipKey(value: string): string {
    return `login:ip:${this.hash(value)}`;
  }

  private hash(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }

  private number(key: string, fallback: number): number {
    return Number(this.config.get(key, fallback));
  }
}
