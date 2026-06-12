import { TimelineService } from './timeline.service';
export declare class TimelineController {
    private readonly timelineService;
    constructor(timelineService: TimelineService);
    findAllByPatient(patientId: string, req: any): Promise<{
        id: string;
        organizationId: string;
        createdAt: Date;
        createdBy: string | null;
        patientId: string;
        description: string | null;
        eventType: string;
        eventCategory: string;
        title: string;
        metadata: import("@prisma/client/runtime/library").JsonValue | null;
    }[]>;
}
