"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PdfService = void 0;
const common_1 = require("@nestjs/common");
const PDFDocument = require('pdfkit');
let PdfService = class PdfService {
    async generatePrescriptionPdf(prescription, organization) {
        return new Promise((resolve, reject) => {
            const doc = new PDFDocument({ size: 'A4', margin: 50 });
            const buffers = [];
            doc.on('data', buffers.push.bind(buffers));
            doc.on('end', () => resolve(Buffer.concat(buffers)));
            doc.on('error', reject);
            const primaryColor = organization.primaryColor || '#1FA971';
            doc.rect(0, 0, 595.28, 100).fill(primaryColor);
            doc.fillColor('#FFFFFF').fontSize(24).text('ClinicOS', 50, 30, { bold: true });
            doc.fontSize(10).text(organization.name, 50, 60);
            doc.fillColor('#FFFFFF').fontSize(14).text(`Dr. ${prescription.doctor.firstName} ${prescription.doctor.lastName}`, 400, 30, { align: 'right' });
            doc.fontSize(8).text('Medical Practitioner', 400, 50, { align: 'right' });
            doc.moveDown(6);
            doc.fillColor('#444444').fontSize(10).text('PATIENT DETAILS', 50, 120, { underline: true });
            doc.fillColor('#000000').fontSize(12).text(`${prescription.patient.firstName} ${prescription.patient.lastName}`, 50, 140, { bold: true });
            doc.fontSize(10).text(`Gender: ${prescription.patient.gender} | Date: ${new Date(prescription.issuedAt).toLocaleDateString()}`, 50, 155);
            doc.moveDown(2);
            doc.fillColor(primaryColor).fontSize(30).text('℞', 50, 200);
            doc.moveTo(80, 225).lineTo(545, 225).stroke('#EEEEEE');
            let currentY = 250;
            prescription.items.forEach((item, index) => {
                doc.fillColor('#333333').fontSize(11).text(`${index + 1}. ${item.medicineName}`, 50, currentY, { bold: true });
                doc.fontSize(10).text(`${item.dosage} | ${item.frequency} | ${item.duration}`, 70, currentY + 15);
                if (item.instructions) {
                    doc.fillColor('#666666').fontSize(9).text(`Note: ${item.instructions}`, 70, currentY + 30, { italic: true });
                    currentY += 60;
                }
                else {
                    currentY += 45;
                }
            });
            doc.fontSize(8).fillColor('#999999').text(organization.footerText || '', 50, 780, { align: 'center', width: 500 });
            doc.end();
        });
    }
    async generateInvoicePdf(invoice, organization) {
        return new Promise((resolve, reject) => {
            const doc = new PDFDocument({ size: 'A4', margin: 50 });
            const buffers = [];
            doc.on('data', buffers.push.bind(buffers));
            doc.on('end', () => resolve(Buffer.concat(buffers)));
            doc.on('error', reject);
            const primaryColor = organization.primaryColor || '#1FA971';
            doc.fillColor(primaryColor).fontSize(20).text('INVOICE', 50, 50, { bold: true });
            doc.fillColor('#444444').fontSize(10).text(`Invoice #: ${invoice.invoiceNumber}`, 50, 75);
            doc.text(`Date: ${new Date(invoice.createdAt).toLocaleDateString()}`, 50, 90);
            doc.end();
        });
    }
};
exports.PdfService = PdfService;
exports.PdfService = PdfService = __decorate([
    (0, common_1.Injectable)()
], PdfService);
//# sourceMappingURL=pdf.service.js.map