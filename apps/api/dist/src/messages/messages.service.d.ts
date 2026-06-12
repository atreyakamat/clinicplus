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
        patientId: string;
        channel: import("@prisma/client").$Enums.MessageChannel;
        direction: import("@prisma/client").$Enums.MessageDirection;
        messageBody: string;
        deliveryStatus: string | null;
        sentAt: Date;
        createdAt: Date;
        updatedAt: Date;
    })[]>;
    sendWhatsApp(patientId: string, content: string, organizationId: string, branchId: string): Promise<{
        id: string;
        organizationId: string;
        branchId: string;
        patientId: string;
        channel: import("@prisma/client").$Enums.MessageChannel;
        direction: import("@prisma/client").$Enums.MessageDirection;
        messageBody: string;
        deliveryStatus: string | null;
        sentAt: Date;
        createdAt: Date;
        updatedAt: Date;
    }>;
    sendSms(patientId: string, content: string, organizationId: string, branchId: string): Promise<{
        id: string;
        organizationId: string;
        branchId: string;
        patientId: string;
        channel: import("@prisma/client").$Enums.MessageChannel;
        direction: import("@prisma/client").$Enums.MessageDirection;
        messageBody: string;
        deliveryStatus: string | null;
        sentAt: Date;
        createdAt: Date;
        updatedAt: Date;
    }>;
    getTemplates(organizationId: string): Promise<{
        id: string;
        organizationId: string;
        branchId: string | null;
        channel: import("@prisma/client").$Enums.TemplateChannel;
        createdAt: Date;
        updatedAt: Date;
        name: string;
        templateContent: string;
    }[]>;
}
