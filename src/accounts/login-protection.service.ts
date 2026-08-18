import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';

type Counter = { count: number; expiresAt: number };
type Lock = { expiresAt: number };

@Injectable()
export class LoginProtectionService {
  private readonly logger = new Logger(LoginProtectionService.name);
  private readonly failures = new Map<string, Counter>();
  private readonly blocked = new Map<string, Lock>();

  constructor(private readonly config: ConfigService) {}

  async assertAllowed(
    phoneNumber: string,
    ipAddress: string | null,
  ): Promise<void> {
    try {
      const keys = [
        this.phoneKey(phoneNumber),
        ipAddress && this.ipKey(ipAddress),
      ].filter((value): value is string => !!value);
      for (const key of keys) {
        const ttl = this.lockTtlSeconds(key);
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
    try {
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

      const now = Date.now();
      for (const [key, limit] of checks) {
        let counter = this.failures.get(key);
        if (!counter || counter.expiresAt <= now) {
          counter = { count: 0, expiresAt: now + windowSeconds * 1000 };
        }
        counter.count += 1;
        this.failures.set(key, counter);
        if (counter.count >= limit) {
          this.blocked.set(key, { expiresAt: now + lockSeconds * 1000 });
        }
      }
    } catch (error) {
      this.logger.warn(
        `Could not record login failure: ${(error as Error).message}`,
      );
    }
  }

  async clear(phoneNumber: string): Promise<void> {
    try {
      const key = this.phoneKey(phoneNumber);
      this.failures.delete(key);
      this.blocked.delete(key);
    } catch (error) {
      this.logger.warn(
        `Could not clear login failures: ${(error as Error).message}`,
      );
    }
  }

  private lockTtlSeconds(key: string): number {
    const lock = this.blocked.get(key);
    if (!lock) return 0;
    const remaining = Math.ceil((lock.expiresAt - Date.now()) / 1000);
    if (remaining <= 0) {
      this.blocked.delete(key);
      return 0;
    }
    return remaining;
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
