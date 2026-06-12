import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { AuditService } from '../services/audit.service';

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private auditService: AuditService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const { user, method, url, body } = request;

    return next.handle().pipe(
      tap((response) => {
        // Handle both raw and wrapped response data
        const data = response?.data || response;

        // Special case for login/logout which might not have 'user' in request yet
        if (url.includes('/auth/login') && method === 'POST') {
          const orgId = data?.user?.organizationId;
          const actorId = data?.user?.id;

          if (orgId && orgId.length === 36) {
            this.auditService
              .log({
                organizationId: orgId,
                userId: actorId && actorId.length === 36 ? actorId : undefined,
                action: 'LOGIN',
                resource: 'auth',
                resourceId: actorId,
                afterData: { email: body.email },
                ipAddress: request.ip,
                userAgent: request.get('user-agent'),
              })
              .catch((err) => console.error('Audit logging failed:', err));
          }
          return;
        }

        if (!user) return;

        // Log write operations and sensitive reads
        if (['POST', 'PATCH', 'PUT', 'DELETE'].includes(method)) {
          const orgId = user.organizationId;
          if (orgId && orgId.length === 36) {
            this.auditService
              .log({
                organizationId: orgId,
                userId: user.id,
                action: method,
                resource: url.split('/')[3] || 'unknown',
                resourceId: data?.id || body?.id || url.split('/')[4],
                afterData: body,
                ipAddress: request.ip,
                userAgent: request.get('user-agent'),
              })
              .catch((err) => console.error('Audit logging failed:', err));
          }
        }
      }),
    );
  }
}
