import { PrismaService } from '../prisma/prisma.service';
import { MessagesService } from '../messages/messages.service';
export declare class FollowUpReminderService {
    private prisma;
    private messagesService;
    private readonly logger;
    constructor(prisma: PrismaService, messagesService: MessagesService);
    sendFollowUpReminders(daysBefore: number): Promise<void>;
    sendTomorrowFollowUpReminders(): Promise<void>;
    sendTodayFollowUpReminders(): Promise<void>;
}
