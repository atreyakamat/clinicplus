import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { TimelineService } from '../../timeline/timeline.service';

@Injectable()
export class TimelineInterceptor implements NestInterceptor {
  constructor(private timelineService: TimelineService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const { user, method, url, body } = request;

    if (!user) return next.handle();

    return next.handle().pipe(
      tap((data) => {
        // Automatically detect and record timeline events
        if (['POST', 'PATCH', 'PUT'].includes(method)) {
          let patientId: string | null = null;
          if (body && body.patientId) patientId = body.patientId;
          else if (data && data.patientId) patientId = data.patientId;
          else if (url && url.includes('patients/'))
            patientId = url.split('/')[4];

          if (patientId && patientId.length === 36) {
            // Basic UUID check
            const module = url.split('/')[3];
            let eventType = '';
            let title = '';

            switch (module) {
              case 'appointments':
                eventType =
                  method === 'POST'
                    ? 'APPOINTMENT_BOOKED'
                    : 'APPOINTMENT_UPDATED';
                title =
                  method === 'POST' ? 'New Appointment' : 'Appointment Updated';
                break;
              case 'consultations':
                eventType =
                  method === 'POST'
                    ? 'CONSULTATION_STARTED'
                    : 'CONSULTATION_UPDATED';
                title =
                  method === 'POST'
                    ? 'Consultation Started'
                    : 'Consultation Updated';
                break;
              case 'prescriptions':
                eventType = 'PRESCRIPTION_GENERATED';
                title = 'Prescription Issued';
                break;
              case 'invoices':
                eventType = 'INVOICE_GENERATED';
                title = 'Billing Generated';
                break;
              case 'payments':
                eventType = 'PAYMENT_COLLECTED';
                title = 'Payment Received';
                break;
              default:
                return;
            }

            this.timelineService.record({
              organizationId: user.organizationId,
              patientId,
              eventType,
              eventCategory: 'SYSTEM',
              title,
              description: `Action performed via ${module} module.`,
              createdBy: user.id,
              metadata: {
                method,
                url,
                body: method === 'POST' ? body : undefined,
              },
            });
          }
        }
      }),
    );
  }
}
