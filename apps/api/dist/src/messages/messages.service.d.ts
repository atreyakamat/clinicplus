import { PrismaService } from '../prisma/prisma.service';
import { SmsService } from './sms.service';
export declare class MessagesService {
    private prisma;
    private smsService;
    constructor(prisma: PrismaService, smsService: SmsService);
    findAll(organizationId: string, branchId: string): Promise<({
        patient: {
            firstName: string;
            lastName: string;
            phone: string | null;
        };
    } & {
        id: string;
        organizationId: string;
        branchId: string;
        createdAt: Date;
        updatedAt: Date;
        channel: import("@prisma/client").$Enums.MessageChannel;
        direction: import("@prisma/client").$Enums.MessageDirection;
        messageBody: string;
        deliveryStatus: string | null;
        sentAt: Date;
        patientId: string;
    })[]>;
    sendWhatsApp(patientId: string, content: string, organizationId: string, branchId: string): Promise<{
        id: string;
        organizationId: string;
        branchId: string;
        createdAt: Date;
        updatedAt: Date;
        channel: import("@prisma/client").$Enums.MessageChannel;
        direction: import("@prisma/client").$Enums.MessageDirection;
        messageBody: string;
        deliveryStatus: string | null;
        sentAt: Date;
        patientId: string;
    }>;
    sendSms(patientId: string, content: string, organizationId: string, branchId: string): Promise<{
        gatewayMessageId: string | undefined;
        gatewayError: string | undefined;
        id: string;
        organizationId: string;
        branchId: string;
        createdAt: Date;
        updatedAt: Date;
        channel: import("@prisma/client").$Enums.MessageChannel;
        direction: import("@prisma/client").$Enums.MessageDirection;
        messageBody: string;
        deliveryStatus: string | null;
        sentAt: Date;
        patientId: string;
    }>;
    getTemplates(organizationId: string): Promise<{
        id: string;
        organizationId: string;
        branchId: string | null;
        createdAt: Date;
        updatedAt: Date;
        name: string;
        channel: import("@prisma/client").$Enums.TemplateChannel;
        templateContent: string;
    }[]>;
}
