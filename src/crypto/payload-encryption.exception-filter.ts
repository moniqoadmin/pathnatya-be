import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { PayloadCryptoService } from './payload-crypto.service';

function isLocalhostRequest(request: Request): boolean {
  const host = (request.hostname ?? '').toLowerCase();
  return host === 'localhost' || host === '127.0.0.1' || host === '::1';
}

@Catch()
export class PayloadEncryptionExceptionFilter implements ExceptionFilter {
  constructor(private readonly payloadCrypto: PayloadCryptoService) {}

  async catch(exception: unknown, host: ArgumentsHost): Promise<void> {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const exceptionResponse =
      exception instanceof HttpException
        ? exception.getResponse()
        : 'Internal server error';

    const body =
      typeof exceptionResponse === 'string'
        ? { statusCode: status, message: exceptionResponse }
        : exceptionResponse;

    if (
      typeof body === 'object' &&
      body !== null &&
      'retryAfterSeconds' in body
    ) {
      response.setHeader(
        'Retry-After',
        String((body as { retryAfterSeconds: number }).retryAfterSeconds),
      );
    }

    if (
      !this.payloadCrypto.isEnabled() ||
      this.shouldSkipPath(request) ||
      isLocalhostRequest(request)
    ) {
      response.status(status).json(body);
      return;
    }

    const encrypted = await this.payloadCrypto.encryptJson(body);
    response.status(status).json({ payload: encrypted });
  }

  private shouldSkipPath(request: Request): boolean {
    const path = request.path ?? request.url ?? '';
    return (
      path.startsWith('/docs') ||
      path === '/api/health' ||
      path.startsWith('/api/health/')
    );
  }
}
