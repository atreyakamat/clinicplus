import { InvoicesService } from './invoices.service';
export declare class InvoicesController {
    private readonly invoicesService;
    constructor(invoicesService: InvoicesService);
    create(data: any, req: any): Promise<{
        items: {
            id: string;
            createdAt: Date;
            updatedAt: Date;
            organizationId: string;
            branchId: string;
            itemName: string;
            quantity: number;
            unitPrice: import("@prisma/client/runtime/library").Decimal;
            amount: import("@prisma/client/runtime/library").Decimal;
            invoiceId: string;
        }[];
    } & {
        id: string;
        status: import("@prisma/client").$Enums.InvoiceStatus;
        createdAt: Date;
        updatedAt: Date;
        createdBy: string | null;
        updatedBy: string | null;
        deletedAt: Date | null;
        deletedBy: string | null;
        deleteReason: string | null;
        organizationId: string;
        branchId: string;
        patientId: string;
        invoiceNumber: string;
        subtotal: import("@prisma/client/runtime/library").Decimal;
        discount: import("@prisma/client/runtime/library").Decimal;
        tax: import("@prisma/client/runtime/library").Decimal;
        total: import("@prisma/client/runtime/library").Decimal;
    }>;
    findAll(req: any): Promise<({
        patient: {
            firstName: string;
            lastName: string;
        };
        payments: {
            id: string;
            createdAt: Date;
            updatedAt: Date;
            organizationId: string;
            branchId: string;
            amount: import("@prisma/client/runtime/library").Decimal;
            paymentMethod: string;
            transactionReference: string | null;
            paymentStatus: import("@prisma/client").$Enums.PaymentStatus;
            paidAt: Date | null;
            invoiceId: string;
        }[];
    } & {
        id: string;
        status: import("@prisma/client").$Enums.InvoiceStatus;
        createdAt: Date;
        updatedAt: Date;
        createdBy: string | null;
        updatedBy: string | null;
        deletedAt: Date | null;
        deletedBy: string | null;
        deleteReason: string | null;
        organizationId: string;
        branchId: string;
        patientId: string;
        invoiceNumber: string;
        subtotal: import("@prisma/client/runtime/library").Decimal;
        discount: import("@prisma/client/runtime/library").Decimal;
        tax: import("@prisma/client/runtime/library").Decimal;
        total: import("@prisma/client/runtime/library").Decimal;
    })[]>;
    findOne(id: string): Promise<{
        patient: {
            id: string;
            email: string | null;
            phone: string | null;
            status: import("@prisma/client").$Enums.RecordStatus;
            createdAt: Date;
            updatedAt: Date;
            createdBy: string | null;
            updatedBy: string | null;
            deletedAt: Date | null;
            deletedBy: string | null;
            deleteReason: string | null;
            organizationId: string;
            firstName: string;
            lastName: string;
            branchId: string;
            patientCode: string | null;
            middleName: string | null;
            gender: string | null;
            dateOfBirth: Date | null;
            bloodGroup: string | null;
            maritalStatus: string | null;
            occupation: string | null;
            abhaNumber: string | null;
        };
        items: {
            id: string;
            createdAt: Date;
            updatedAt: Date;
            organizationId: string;
            branchId: string;
            itemName: string;
            quantity: number;
            unitPrice: import("@prisma/client/runtime/library").Decimal;
            amount: import("@prisma/client/runtime/library").Decimal;
            invoiceId: string;
        }[];
        payments: {
            id: string;
            createdAt: Date;
            updatedAt: Date;
            organizationId: string;
            branchId: string;
            amount: import("@prisma/client/runtime/library").Decimal;
            paymentMethod: string;
            transactionReference: string | null;
            paymentStatus: import("@prisma/client").$Enums.PaymentStatus;
            paidAt: Date | null;
            invoiceId: string;
        }[];
    } & {
        id: string;
        status: import("@prisma/client").$Enums.InvoiceStatus;
        createdAt: Date;
        updatedAt: Date;
        createdBy: string | null;
        updatedBy: string | null;
        deletedAt: Date | null;
        deletedBy: string | null;
        deleteReason: string | null;
        organizationId: string;
        branchId: string;
        patientId: string;
        invoiceNumber: string;
        subtotal: import("@prisma/client/runtime/library").Decimal;
        discount: import("@prisma/client/runtime/library").Decimal;
        tax: import("@prisma/client/runtime/library").Decimal;
        total: import("@prisma/client/runtime/library").Decimal;
    }>;
    addPayment(id: string, data: any, req: any): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        organizationId: string;
        branchId: string;
        amount: import("@prisma/client/runtime/library").Decimal;
        paymentMethod: string;
        transactionReference: string | null;
        paymentStatus: import("@prisma/client").$Enums.PaymentStatus;
        paidAt: Date | null;
        invoiceId: string;
    }>;
}
