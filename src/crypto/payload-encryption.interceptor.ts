import {
  BadRequestException,
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { Observable, from, of } from 'rxjs';
import { switchMap } from 'rxjs/operators';
import { PayloadCryptoService } from './payload-crypto.service';
import { SKIP_PAYLOAD_ENCRYPTION_KEY } from './skip-payload-encryption.decorator';

function isLocalhostRequest(request: Request): boolean {
  const host = (request.hostname ?? '').toLowerCase();
  return host === 'localhost' || host === '127.0.0.1' || host === '::1';
}

@Injectable()
export class PayloadEncryptionInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly payloadCrypto: PayloadCryptoService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (!this.payloadCrypto.isEnabled()) {
      return next.handle();
    }

    const skip = this.reflector.getAllAndOverride<boolean>(
      SKIP_PAYLOAD_ENCRYPTION_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (skip) {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest<Request>();

    if (this.shouldSkipPath(request)) {
      return next.handle();
    }

    const local = isLocalhostRequest(request);

    return from(this.decryptRequestBody(request, local)).pipe(
      switchMap(() => next.handle()),
      // Localhost always returns plain JSON (even if the request was encrypted).
      switchMap((data) =>
        local ? of(data) : from(this.encryptResponse(data)),
      ),
    );
  }

  private shouldSkipPath(request: Request): boolean {
    const path = request.path ?? request.url ?? '';
    return (
      path.startsWith('/docs') ||
      path === '/api/health' ||
      path.startsWith('/api/health/')
    );
  }

  private async decryptRequestBody(
    request: Request,
    local: boolean,
  ): Promise<void> {
    const contentType = String(request.headers['content-type'] ?? '');

    // Multipart (file uploads) and non-JSON bodies stay as-is.
    if (!contentType.includes('application/json')) {
      return;
    }

    const body = request.body as Record<string, unknown> | undefined;
    if (!body || typeof body !== 'object' || Object.keys(body).length === 0) {
      return;
    }

    const hasEncryptedEnvelope =
      typeof body.payload === 'string' &&
      !!body.payload &&
      Object.keys(body).length === 1;

    if (hasEncryptedEnvelope) {
      request.body = await this.payloadCrypto.decryptJson(
        body.payload as string,
      );
      return;
    }

    // Localhost: accept normal JSON without encryption.
    if (local) {
      return;
    }

    throw new BadRequestException(
      'Encrypted payload required. Send JSON as { "payload": "<jwe>" }.',
    );
  }

  private async encryptResponse(data: unknown): Promise<unknown> {
    if (data === undefined || data === null) {
      return data;
    }
    if (Buffer.isBuffer(data)) {
      return data;
    }

    const encrypted = await this.payloadCrypto.encryptJson(data);
    return { payload: encrypted };
  }
}
