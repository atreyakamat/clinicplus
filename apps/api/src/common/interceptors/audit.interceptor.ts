import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
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
      tap((data) => {
        // Special case for login/logout which might not have 'user' in request yet
        if (url.includes('/auth/login') && method === 'POST') {
           this.auditService.log({
             organizationId: data?.user?.organizationId || 'SYSTEM',
             userId: data?.user?.id || 'ANONYMOUS',
             action: 'LOGIN',
             resource: 'auth',
             resourceId: data?.user?.id,
             afterData: { email: body.email },
             ipAddress: request.ip,
             userAgent: request.get('user-agent'),
           });
           return;
        }

        if (!user) return;

        // Log write operations and sensitive reads
        if (['POST', 'PATCH', 'PUT', 'DELETE'].includes(method)) {
          this.auditService.log({
            organizationId: user.organizationId,
            userId: user.id,
            action: method,
            resource: url.split('/')[3] || 'unknown',
            resourceId: data?.id || body?.id || url.split('/')[4],
            afterData: body,
            ipAddress: request.ip,
            userAgent: request.get('user-agent'),
          });
        }
      }),
    );
  }
}
