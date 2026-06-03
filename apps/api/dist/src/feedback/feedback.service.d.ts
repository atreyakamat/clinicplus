import { PrismaService } from '../prisma/prisma.service';
export declare class FeedbackService {
    private prisma;
    constructor(prisma: PrismaService);
    create(data: any): Promise<{
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
    findAll(organizationId: string): Promise<({
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
    updateStatus(id: string, status: string, organizationId: string): Promise<{
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
