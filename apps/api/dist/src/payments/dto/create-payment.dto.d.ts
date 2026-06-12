export declare class CreatePaymentDto {
    invoiceId: string;
    amount: number;
    paymentMethod: string;
    transactionReference?: string;
    paymentStatus?: string;
}
