import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Request } from 'express';
import { Observable } from 'rxjs';

/**
 * Flattens { data: { ... } } bodies so ValidationPipe sees the inner fields.
 * Leaves already-flat bodies unchanged.
 */
@Injectable()
export class UnwrapDataInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request>();
    const body = request.body as Record<string, unknown> | undefined;
    const inner = body?.data;
    if (
      inner &&
      typeof inner === 'object' &&
      !Array.isArray(inner) &&
      typeof body?.event !== 'string'
    ) {
      request.body = inner;
    }
    return next.handle();
  }
}
