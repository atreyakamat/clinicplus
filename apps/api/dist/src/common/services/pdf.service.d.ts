export declare class PdfService {
    private addImageFromBase64;
    generatePrescriptionPdf(prescription: any, organization: any): Promise<Buffer>;
    generateInvoicePdf(invoice: any, organization: any): Promise<Buffer>;
}
