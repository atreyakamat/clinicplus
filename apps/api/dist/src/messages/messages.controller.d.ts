import { MessagesService } from './messages.service';
export declare class MessagesController {
    private readonly messagesService;
    constructor(messagesService: MessagesService);
    findAll(req: any): Promise<({
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
    sendWhatsApp(data: {
        patientId: string;
        content: string;
    }, req: any): Promise<{
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
    sendSms(data: {
        patientId: string;
        content: string;
    }, req: any): Promise<{
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
    getTemplates(req: any): Promise<{
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
