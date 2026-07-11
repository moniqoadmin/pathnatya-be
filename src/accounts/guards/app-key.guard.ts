import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'crypto';
import { Request } from 'express';

@Injectable()
export class AppKeyGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const expectedKey = this.configService.getOrThrow<string>('ELECTRON_APP_KEY');
    const request = context.switchToHttp().getRequest<Request>();
    const providedKey = request.headers['x-app-key'];

    if (typeof providedKey !== 'string' || !this.keysMatch(providedKey, expectedKey)) {
      throw new UnauthorizedException('Invalid or missing token');
    }

    return true;
  }

  private keysMatch(provided: string, expected: string): boolean {
    const providedBuf = Buffer.from(provided);
    const expectedBuf = Buffer.from(expected);
    if (providedBuf.length !== expectedBuf.length) {
      return false;
    }
    return timingSafeEqual(providedBuf, expectedBuf);
  }
}
