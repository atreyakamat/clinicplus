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

    if (!user) return next.handle();

    return next.handle().pipe(
      tap((data) => {
        // Only log write operations for performance
        if (['POST', 'PATCH', 'PUT', 'DELETE'].includes(method)) {
          this.auditService.log({
            organizationId: user.organizationId,
            userId: user.id,
            action: method,
            resource: url.split('/')[3] || 'unknown',
            resourceId: data?.id,
            newData: body,
            ipAddress: request.ip,
            userAgent: request.get('user-agent'),
          });
        }
      }),
    );
  }
}
