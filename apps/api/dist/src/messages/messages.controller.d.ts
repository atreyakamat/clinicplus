import { MessagesService } from './messages.service';
export declare class MessagesController {
    private readonly messagesService;
    constructor(messagesService: MessagesService);
    findAll(req: any): Promise<({
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
    sendWhatsApp(data: {
        patientId: string;
        content: string;
    }, req: any): Promise<{
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
    sendSms(data: {
        patientId: string;
        content: string;
    }, req: any): Promise<{
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
    getTemplates(req: any): Promise<{
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
