import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface Response<T> {
  data: T;
  meta?: Record<string, unknown>;
}

/** Keys that must never leave the API, wherever they appear in a response graph. */
const SENSITIVE_KEYS = new Set(['passwordHash', 'refreshTokenHash', 'password']);

export function scrubSensitive<T>(value: T, depth = 0): T {
  if (value === null || value === undefined || depth > 12) return value;
  if (Array.isArray(value)) return value.map((v) => scrubSensitive(v, depth + 1)) as unknown as T;
  if (value instanceof Date || Buffer.isBuffer(value)) return value;
  if (typeof value === 'object') {
    // Prisma Decimal and similar value objects: keep as is
    const proto = Object.getPrototypeOf(value);
    if (proto && proto !== Object.prototype && typeof (value as any).toJSON === 'function') return value;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEYS.has(k)) continue;
      out[k] = scrubSensitive(v, depth + 1);
    }
    return out as T;
  }
  return value;
}

/**
 * Wraps every successful response as { data, meta }. Services that already
 * return a paginated envelope ({ items, total, page, limit }) are flattened so
 * the client receives { data: items, meta: { total, page, limit } }.
 */
@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<T, Response<T>> {
  intercept(context: ExecutionContext, next: CallHandler): Observable<Response<T>> {
    const request = context.switchToHttp().getRequest();
    return next.handle().pipe(
      map((payload) => {
        const meta: Record<string, unknown> = {
          timestamp: new Date().toISOString(),
          path: request.url,
        };
        let data = payload;
        if (
          payload &&
          typeof payload === 'object' &&
          !Array.isArray(payload) &&
          Array.isArray((payload as any).items) &&
          typeof (payload as any).total === 'number'
        ) {
          const { items, total, page, limit } = payload as any;
          data = items;
          Object.assign(meta, { total, page, limit, pages: limit ? Math.ceil(total / limit) : 1 });
        }
        return { data: scrubSensitive(data), meta };
      }),
    );
  }
}
