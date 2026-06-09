import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';
export declare class InvoicesService {
    private prisma;
    constructor(prisma: PrismaService);
    create(data: any, organizationId: string, branchId: string, createdBy: string): Promise<{
        items: {
            id: string;
            createdAt: Date;
            updatedAt: Date;
            organizationId: string;
            branchId: string;
            itemName: string;
            quantity: number;
            unitPrice: Prisma.Decimal;
            amount: Prisma.Decimal;
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
        subtotal: Prisma.Decimal;
        discount: Prisma.Decimal;
        tax: Prisma.Decimal;
        total: Prisma.Decimal;
    }>;
    findAll(organizationId: string, branchId: string): Promise<({
        payments: {
            id: string;
            createdAt: Date;
            updatedAt: Date;
            organizationId: string;
            branchId: string;
            amount: Prisma.Decimal;
            paymentMethod: string;
            transactionReference: string | null;
            paymentStatus: import("@prisma/client").$Enums.PaymentStatus;
            paidAt: Date | null;
            invoiceId: string;
        }[];
        patient: {
            firstName: string;
            lastName: string;
        };
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
        subtotal: Prisma.Decimal;
        discount: Prisma.Decimal;
        tax: Prisma.Decimal;
        total: Prisma.Decimal;
    })[]>;
    findOne(id: string, organizationId: string, branchId: string): Promise<{
        payments: {
            id: string;
            createdAt: Date;
            updatedAt: Date;
            organizationId: string;
            branchId: string;
            amount: Prisma.Decimal;
            paymentMethod: string;
            transactionReference: string | null;
            paymentStatus: import("@prisma/client").$Enums.PaymentStatus;
            paidAt: Date | null;
            invoiceId: string;
        }[];
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
            unitPrice: Prisma.Decimal;
            amount: Prisma.Decimal;
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
        subtotal: Prisma.Decimal;
        discount: Prisma.Decimal;
        tax: Prisma.Decimal;
        total: Prisma.Decimal;
    }>;
    addPayment(invoiceId: string, paymentData: any, organizationId: string, branchId: string): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        organizationId: string;
        branchId: string;
        amount: Prisma.Decimal;
        paymentMethod: string;
        transactionReference: string | null;
        paymentStatus: import("@prisma/client").$Enums.PaymentStatus;
        paidAt: Date | null;
        invoiceId: string;
    }>;
}
