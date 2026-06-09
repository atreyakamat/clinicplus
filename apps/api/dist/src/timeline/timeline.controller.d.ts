import { TimelineService } from './timeline.service';
export declare class TimelineController {
    private readonly timelineService;
    constructor(timelineService: TimelineService);
    findAllByPatient(patientId: string, req: any): Promise<{
        id: string;
        createdAt: Date;
        createdBy: string | null;
        organizationId: string;
        description: string | null;
        patientId: string;
        eventType: string;
        eventCategory: string;
        title: string;
        metadata: import("@prisma/client/runtime/library").JsonValue | null;
    }[]>;
}
