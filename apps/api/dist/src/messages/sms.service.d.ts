import { PrismaService } from '../prisma/prisma.service';
export declare class SmsService {
    private prisma;
    constructor(prisma: PrismaService);
    sendSms(to: string, content: string, organizationId: string, branchId: string): Promise<boolean>;
    sendAndRecord(patientId: string, content: string, organizationId: string, branchId: string): Promise<{
        id: string;
        branchId: string;
        channel: import("@prisma/client").$Enums.MessageChannel;
        direction: import("@prisma/client").$Enums.MessageDirection;
        messageBody: string;
        deliveryStatus: string | null;
        sentAt: Date;
        createdAt: Date;
        updatedAt: Date;
        organizationId: string;
        patientId: string;
    }>;
}
