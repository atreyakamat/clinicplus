export declare class PdfService {
    generatePrescriptionPdf(prescription: any, organization: any): Promise<Buffer<ArrayBuffer>>;
    generateInvoicePdf(invoice: any, organization: any): Promise<Buffer<ArrayBuffer>>;
}
