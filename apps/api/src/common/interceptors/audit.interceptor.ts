import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { AuditService } from '../services/audit.service';
import { isUuid } from '../validation/uuid';

/**
 * Generic write-audit for authenticated mutations. Auth endpoints and modules
 * that write richer audit rows themselves are skipped to avoid duplicates.
 */
const SKIP_PREFIXES = ['/api/v1/auth', '/api/v1/patients', '/api/v1/appointments', '/api/v1/users', '/api/v1/staff-invitations'];

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private auditService: AuditService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const { user, method, url, body } = request;
    if (!user || !['POST', 'PATCH', 'PUT', 'DELETE'].includes(method)) return next.handle();
    const path = String(url).split('?')[0];
    if (SKIP_PREFIXES.some((p) => path.startsWith(p))) return next.handle();

    return next.handle().pipe(
      tap((response) => {
        const data = response?.data ?? response;
        const segments = path.split('/').filter(Boolean); // ['api','v1','invoices',':id',...]
        const resource = segments[2] || 'unknown';
        const candidate = data?.id ?? segments[3];
        this.auditService
          .log({
            organizationId: user.organizationId,
            userId: user.id,
            action: method,
            resource,
            resourceId: isUuid(candidate) ? candidate : undefined,
            afterData: body && Object.keys(body).length ? body : undefined,
            ipAddress: request.ip,
            userAgent: request.get('user-agent'),
          })
          .catch(() => undefined);
      }),
    );
  }
}
