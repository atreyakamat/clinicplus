import { Injectable } from '@nestjs/common';
const PDFDocument = require('pdfkit');

@Injectable()
export class PdfService {
  private addImageFromBase64(doc: any, base64String: string, x: number, y: number, options: any = {}) {
    try {
      const base64Data = base64String.replace(/^data:image\/\w+;base64,/, "");
      const buffer = Buffer.from(base64Data, 'base64');
      doc.image(buffer, x, y, options);
    } catch (e) {
      console.error('Failed to embed image', e);
    }
  }

  async generatePrescriptionPdf(
    prescription: any,
    organization: any,
  ): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      const buffers: Buffer[] = [];
      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);

      const primaryColor = organization.primaryColor || '#1FA971';

      // --- Header: Branding ---
      if (organization.letterheadUrl) {
        this.addImageFromBase64(doc, organization.letterheadUrl, 0, 0, { width: 595.28 });
        doc.moveDown(4); // Move past the letterhead
      } else {
        doc.rect(0, 0, 595.28, 100).fill(primaryColor);
        
        if (organization.logoUrl) {
          this.addImageFromBase64(doc, organization.logoUrl, 50, 20, { height: 60 });
        } else {
          doc
            .fillColor('#FFFFFF')
            .fontSize(24)
            .text('ClinicOS', 50, 30, { bold: true });
        }
        
        doc.fillColor('#FFFFFF').fontSize(10).text(organization.name, 50, 80);

        doc
          .fillColor('#FFFFFF')
          .fontSize(14)
          .text(
            `Dr. ${prescription.doctor.firstName} ${prescription.doctor.lastName}`,
            400,
            30,
            { align: 'right' },
          );
        doc.fontSize(8).text(prescription.doctor.qualification || 'Medical Practitioner', 400, 50, { align: 'right' });
      }

      // --- Patient Info ---
      doc.y = 120; // reset Y to be safe
      doc
        .fillColor('#444444')
        .fontSize(10)
        .text('PATIENT DETAILS', 50, 120, { underline: true });
      doc
        .fillColor('#000000')
        .fontSize(12)
        .text(
          `${prescription.patient.firstName} ${prescription.patient.lastName}`,
          50,
          140,
          { bold: true },
        );
      doc
        .fontSize(10)
        .text(
          `Gender: ${prescription.patient.gender} | Date: ${new Date(prescription.issuedAt).toLocaleDateString()}`,
          50,
          155,
        );

      // --- Rx Body ---
      doc.moveDown(2);
      doc.fillColor(primaryColor).fontSize(30).text('℞', 50, 200);
      doc.moveTo(80, 225).lineTo(545, 225).stroke('#EEEEEE');

      let currentY = 250;
      prescription.items.forEach((item: any, index: number) => {
        doc
          .fillColor('#333333')
          .fontSize(11)
          .text(`${index + 1}. ${item.medicineName}`, 50, currentY, {
            bold: true,
          });
        doc
          .fontSize(10)
          .text(
            `${item.dosage} | ${item.frequency} | ${item.duration}`,
            70,
            currentY + 15,
          );
        if (item.instructions) {
          doc
            .fillColor('#666666')
            .fontSize(9)
            .text(`Note: ${item.instructions}`, 70, currentY + 30, {
              italic: true,
            });
          currentY += 60;
        } else {
          currentY += 45;
        }
      });

      // --- Doctor Signature ---
      const signatureY = 700;
      if (prescription.doctor.signatureUrl) {
        this.addImageFromBase64(doc, prescription.doctor.signatureUrl, 400, signatureY - 40, { height: 40 });
      }
      doc.moveTo(400, signatureY).lineTo(545, signatureY).stroke('#CCCCCC');
      doc.fillColor('#333333').fontSize(10).text(`Dr. ${prescription.doctor.firstName} ${prescription.doctor.lastName}`, 400, signatureY + 5);

      // --- Footer ---
      doc
        .fontSize(8)
        .fillColor('#999999')
        .text(organization.footerText || '', 50, 780, {
          align: 'center',
          width: 500,
        });

      doc.end();
    });
  }

  async generateInvoicePdf(invoice: any, organization: any): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      const buffers: Buffer[] = [];
      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);

      const primaryColor = organization.primaryColor || '#1FA971';

      if (organization.letterheadUrl) {
        this.addImageFromBase64(doc, organization.letterheadUrl, 0, 0, { width: 595.28 });
        doc.moveDown(4);
      } else {
        if (organization.logoUrl) {
          this.addImageFromBase64(doc, organization.logoUrl, 50, 30, { height: 40 });
        } else {
          doc
            .fillColor(primaryColor)
            .fontSize(20)
            .text(organization.name || 'INVOICE', 50, 30, { bold: true });
        }
      }

      doc.y = 100;
      doc
        .fillColor('#444444')
        .fontSize(10)
        .text(`Invoice #: ${invoice.invoiceNumber}`, 50, 100);
      doc.text(
        `Date: ${new Date(invoice.createdAt).toLocaleDateString()}`,
        50,
        115,
      );

      doc.end();
    });
  }
}
