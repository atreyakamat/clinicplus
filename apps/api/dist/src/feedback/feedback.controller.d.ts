import { FeedbackService } from './feedback.service';
export declare class FeedbackController {
    private readonly feedbackService;
    constructor(feedbackService: FeedbackService);
    create(data: any, req: any): Promise<{
        id: string;
        status: string;
        createdAt: Date;
        updatedAt: Date;
        organizationId: string;
        userId: string;
        priority: string;
        category: string;
        subject: string;
        content: string;
    }>;
    findAll(req: any): Promise<({
        user: {
            firstName: string;
            lastName: string;
        };
    } & {
        id: string;
        status: string;
        createdAt: Date;
        updatedAt: Date;
        organizationId: string;
        userId: string;
        priority: string;
        category: string;
        subject: string;
        content: string;
    })[]>;
    updateStatus(id: string, status: string, req: any): Promise<{
        id: string;
        status: string;
        createdAt: Date;
        updatedAt: Date;
        organizationId: string;
        userId: string;
        priority: string;
        category: string;
        subject: string;
        content: string;
    }>;
}
