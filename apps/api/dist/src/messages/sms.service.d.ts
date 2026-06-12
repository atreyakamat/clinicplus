import { PrismaService } from '../prisma/prisma.service';
export declare class SmsService {
    private prisma;
    constructor(prisma: PrismaService);
    sendSms(to: string, content: string, organizationId: string, branchId: string): Promise<{
        success: boolean;
        messageId?: string;
        error?: string;
    }>;
    sendAndRecord(patientId: string, content: string, organizationId: string, branchId: string): Promise<{
        gatewayMessageId: string | undefined;
        gatewayError: string | undefined;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        organizationId: string;
        branchId: string;
        patientId: string;
        channel: import("@prisma/client").$Enums.MessageChannel;
        direction: import("@prisma/client").$Enums.MessageDirection;
        messageBody: string;
        deliveryStatus: string | null;
        sentAt: Date;
    }>;
}
