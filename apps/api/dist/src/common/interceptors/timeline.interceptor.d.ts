import { NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { TimelineService } from '../../timeline/timeline.service';
export declare class TimelineInterceptor implements NestInterceptor {
    private timelineService;
    constructor(timelineService: TimelineService);
    intercept(context: ExecutionContext, next: CallHandler): Observable<any>;
}
