import { PrismaService } from '../prisma/prisma.service';
import { SmsService } from './sms.service';
export declare class MessagesService {
    private prisma;
    private smsService;
    constructor(prisma: PrismaService, smsService: SmsService);
    findAll(organizationId: string, branchId: string): Promise<({
        patient: {
            phone: string | null;
            firstName: string;
            lastName: string;
        };
    } & {
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
    })[]>;
    sendWhatsApp(patientId: string, content: string, organizationId: string, branchId: string): Promise<{
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
    sendSms(patientId: string, content: string, organizationId: string, branchId: string): Promise<{
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
    getTemplates(organizationId: string): Promise<{
        id: string;
        name: string;
        createdAt: Date;
        updatedAt: Date;
        organizationId: string;
        branchId: string | null;
        channel: import("@prisma/client").$Enums.TemplateChannel;
        templateContent: string;
    }[]>;
}
