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
        patientId: string;
        channel: import("@prisma/client").$Enums.MessageChannel;
        direction: import("@prisma/client").$Enums.MessageDirection;
        messageBody: string;
        deliveryStatus: string | null;
        sentAt: Date;
        createdAt: Date;
        updatedAt: Date;
    })[]>;
    sendWhatsApp(data: {
        patientId: string;
        content: string;
    }, req: any): Promise<{
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
    sendSms(data: {
        patientId: string;
        content: string;
    }, req: any): Promise<{
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
    getTemplates(req: any): Promise<{
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
