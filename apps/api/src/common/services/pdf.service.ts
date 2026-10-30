import { Injectable } from '@nestjs/common';
const PDFDocument = require('pdfkit');

@Injectable()
export class PdfService {
  private addImageFromBase64(
    doc: any,
    base64String: string,
    x: number,
    y: number,
    options: any = {},
  ) {
    try {
      const base64Data = base64String.replace(/^data:image\/\w+;base64,/, '');
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
        this.addImageFromBase64(doc, organization.letterheadUrl, 0, 0, {
          width: 595.28,
        });
        doc.moveDown(4); // Move past the letterhead
      } else {
        doc.rect(0, 0, 595.28, 100).fill(primaryColor);

        if (organization.logoUrl) {
          this.addImageFromBase64(doc, organization.logoUrl, 50, 20, {
            height: 60,
          });
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
        doc
          .fontSize(8)
          .text(
            prescription.doctor.qualification || 'Medical Practitioner',
            400,
            50,
            { align: 'right' },
          );
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
          `${prescription.patient.patientCode ? `ID: ${prescription.patient.patientCode} | ` : ''}Gender: ${prescription.patient.gender ?? '-'} | Date: ${new Date(prescription.issuedAt).toLocaleDateString()}`,
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
            [item.dosage, item.frequency, item.duration].filter(Boolean).join(' | ') || '-',
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

      if (prescription.notes) {
        doc
          .fillColor('#444444')
          .fontSize(9)
          .text(`Advice: ${prescription.notes}`, 50, Math.min(currentY + 10, 640), { width: 495 });
      }
      if (prescription.status === 'CANCELLED') {
        doc
          .fillColor('#DC2626')
          .fontSize(14)
          .text(
            `CANCELLED${prescription.cancelReason ? ` - ${prescription.cancelReason}` : ''}`,
            50,
            175,
            { width: 495 },
          );
      }

      // --- Doctor Signature ---
      const signatureY = 700;
      if (prescription.doctor.signatureUrl) {
        this.addImageFromBase64(
          doc,
          prescription.doctor.signatureUrl,
          400,
          signatureY - 40,
          { height: 40 },
        );
      }
      doc.moveTo(400, signatureY).lineTo(545, signatureY).stroke('#CCCCCC');
      doc
        .fillColor('#333333')
        .fontSize(10)
        .text(
          `Dr. ${prescription.doctor.firstName} ${prescription.doctor.lastName}`,
          400,
          signatureY + 5,
        );

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

  async generateInvoicePdf(
    invoice: any,
    organization: any,
    opts: { currency?: string } = {},
  ): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      const buffers: Buffer[] = [];
      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);

      const primaryColor = organization?.primaryColor || '#1FA971';
      const currency = opts.currency || 'INR';
      const fmt = (v: any) => `${currency} ${Number(v ?? 0).toFixed(2)}`;
      const fmtDate = (d: any) => (d ? new Date(d).toISOString().slice(0, 10) : '-');

      // --- Header ---
      if (organization?.letterheadUrl) {
        this.addImageFromBase64(doc, organization.letterheadUrl, 0, 0, { width: 595.28 });
      } else if (organization?.logoUrl) {
        this.addImageFromBase64(doc, organization.logoUrl, 50, 30, { height: 40 });
      } else {
        doc.fillColor(primaryColor).fontSize(20).text(organization?.name || 'Invoice', 50, 30);
      }
      const branch = invoice.branch || {};
      doc.fillColor('#444444').fontSize(9);
      const contact = [branch.name, branch.address, branch.phone, branch.email].filter(Boolean).join(' | ');
      if (contact) doc.text(contact, 50, 75, { width: 495 });

      doc.fillColor(primaryColor).fontSize(18).text('INVOICE', 400, 30, { width: 145, align: 'right' });
      doc.fillColor('#333333').fontSize(9);
      doc.text(`Invoice #: ${invoice.invoiceNumber}`, 350, 55, { width: 195, align: 'right' });
      doc.text(`Date: ${fmtDate(invoice.createdAt)}`, 350, 67, { width: 195, align: 'right' });
      if (invoice.dueDate) doc.text(`Due: ${fmtDate(invoice.dueDate)}`, 350, 79, { width: 195, align: 'right' });
      doc.text(`Status: ${String(invoice.status).replace('_', ' ')}`, 350, 91, { width: 195, align: 'right' });

      // --- Bill to ---
      const p = invoice.patient || {};
      doc.fillColor('#888888').fontSize(9).text('BILL TO', 50, 115);
      doc.fillColor('#000000').fontSize(11).text(`${p.firstName ?? ''} ${p.lastName ?? ''}`.trim(), 50, 128);
      doc.fontSize(9).fillColor('#444444');
      const pLine = [p.patientCode, p.phone, p.email].filter(Boolean).join(' | ');
      if (pLine) doc.text(pLine, 50, 142);
      if (invoice.appointment?.doctor) {
        const d = invoice.appointment.doctor;
        doc.text(`Doctor: Dr. ${d.firstName} ${d.lastName}`, 50, 154);
      }

      // --- Items table ---
      let y = 180;
      const col = { item: 50, qty: 330, price: 385, amount: 465 };
      doc.rect(50, y, 495, 18).fill(primaryColor);
      doc.fillColor('#FFFFFF').fontSize(9);
      doc.text('Description', col.item + 5, y + 5);
      doc.text('Qty', col.qty, y + 5, { width: 45, align: 'right' });
      doc.text('Unit price', col.price, y + 5, { width: 75, align: 'right' });
      doc.text('Amount', col.amount, y + 5, { width: 75, align: 'right' });
      y += 24;
      doc.fillColor('#222222');
      for (const item of invoice.items || []) {
        if (y > 720) {
          doc.addPage();
          y = 50;
        }
        const h = Math.max(14, doc.heightOfString(item.itemName, { width: 270 }));
        doc.text(item.itemName, col.item + 5, y, { width: 270 });
        doc.text(String(item.quantity), col.qty, y, { width: 45, align: 'right' });
        doc.text(fmt(item.unitPrice), col.price, y, { width: 75, align: 'right' });
        doc.text(fmt(item.amount), col.amount, y, { width: 75, align: 'right' });
        y += h + 6;
        doc.moveTo(50, y - 3).lineTo(545, y - 3).strokeColor('#EEEEEE').stroke();
      }

      // --- Totals ---
      y += 8;
      const totalRow = (label: string, value: string, bold = false) => {
        doc.fillColor(bold ? '#000000' : '#444444').fontSize(bold ? 11 : 9);
        doc.text(label, 330, y, { width: 130, align: 'right' });
        doc.text(value, col.amount, y, { width: 75, align: 'right' });
        y += bold ? 18 : 14;
      };
      totalRow('Subtotal', fmt(invoice.subtotal));
      if (Number(invoice.discount) > 0) totalRow('Discount', `- ${fmt(invoice.discount)}`);
      if (Number(invoice.tax) > 0) totalRow('Tax', fmt(invoice.tax));
      totalRow('Total', fmt(invoice.total), true);
      if (invoice.amountPaid !== undefined) {
        totalRow('Paid', fmt(invoice.amountPaid));
        totalRow('Balance due', fmt(invoice.balance), true);
      }

      // --- Payments ---
      const payments = (invoice.payments || []).filter((pm: any) => !pm.isRefund);
      if (payments.length) {
        y += 10;
        doc.fillColor('#888888').fontSize(9).text('PAYMENTS', 50, y);
        y += 14;
        doc.fillColor('#333333');
        for (const pm of payments) {
          const refunded = (pm.refunds || [])
            .filter((r: any) => r.status !== 'FAILED')
            .reduce((s: number, r: any) => s + Number(r.amount), 0);
          doc.text(
            `${fmtDate(pm.paidAt || pm.createdAt)}  ${pm.paymentMethod}  ${fmt(pm.amount)}` +
              (refunded > 0 ? `  (refunded ${fmt(refunded)})` : ''),
            50,
            y,
          );
          y += 13;
        }
      }

      if (invoice.status === 'VOID') {
        doc.save().rotate(-30, { origin: [300, 420] }).fillColor('#DC2626').opacity(0.2).fontSize(90).text('VOID', 150, 380).restore();
      }
      if (invoice.notes) {
        y += 10;
        doc.fillColor('#666666').fontSize(9).text(`Notes: ${invoice.notes}`, 50, y, { width: 495 });
      }

      doc
        .fontSize(8)
        .fillColor('#999999')
        .text(organization?.footerText || 'Thank you for choosing us.', 50, 780, { align: 'center', width: 495 });

      doc.end();
    });
  }
}
