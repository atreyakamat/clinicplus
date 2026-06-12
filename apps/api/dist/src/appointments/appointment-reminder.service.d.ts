import { PrismaService } from '../prisma/prisma.service';
import { MessagesService } from '../messages/messages.service';
export declare class AppointmentReminderService {
    private prisma;
    private messagesService;
    private readonly logger;
    constructor(prisma: PrismaService, messagesService: MessagesService);
    sendAppointmentReminders(hoursBefore: number): Promise<void>;
    send24HourReminders(): Promise<void>;
    send2HourReminders(): Promise<void>;
}
