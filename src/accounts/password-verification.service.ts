import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { verifyPassword } from './password.util';

@Injectable()
export class PasswordVerificationService {
  private active = 0;
  private readonly waiting: Array<() => void> = [];

  constructor(private readonly config: ConfigService) {}

  async verify(password: string, storedHash: string): Promise<boolean> {
    const release = await this.acquire();
    try {
      return await verifyPassword(password, storedHash);
    } finally {
      release();
    }
  }

  private async acquire(): Promise<() => void> {
    const concurrency = Number(this.config.get('LOGIN_HASH_CONCURRENCY', 4));
    const queueLimit = Number(this.config.get('LOGIN_HASH_QUEUE_LIMIT', 500));
    if (this.active < concurrency) {
      this.active += 1;
      return () => this.release();
    }
    if (this.waiting.length >= queueLimit) {
      const retryAfterSeconds = Number(
        this.config.get('LOGIN_RETRY_AFTER_SECONDS', 5),
      );
      throw new HttpException(
        {
          statusCode: HttpStatus.SERVICE_UNAVAILABLE,
          message: 'Login service is busy. Please try again shortly.',
          retryAfterSeconds,
        },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    await new Promise<void>((resolve) => this.waiting.push(resolve));
    this.active += 1;
    return () => this.release();
  }

  private release(): void {
    this.active = Math.max(0, this.active - 1);
    this.waiting.shift()?.();
  }
}
