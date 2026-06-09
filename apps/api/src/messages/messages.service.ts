import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class MessagesService {
  constructor(private prisma: PrismaService) {}

  async findAll(organizationId: string, branchId: string) {
    return this.prisma.message.findMany({
      where: { organizationId, branchId },
      include: {
        patient: { select: { firstName: true, lastName: true, phone: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async sendWhatsApp(
    patientId: string,
    content: string,
    organizationId: string,
    branchId: string,
  ) {
    let attempts = 0;
    const maxAttempts = 3;
    let success = false;

    while (attempts < maxAttempts && !success) {
      try {
        // In a real app: await this.whatsappProvider.send(...)
        success = true;
      } catch (error) {
        attempts++;
        if (attempts >= maxAttempts) throw error;
      }
    }

    return this.prisma.message.create({
      data: {
        patientId,
        messageBody: content,
        channel: 'WHATSAPP',
        direction: 'OUTBOUND',
        deliveryStatus: success ? 'SENT' : 'FAILED',
        organizationId,
        branchId,
      },
    });
  }

  async getTemplates(organizationId: string) {
    return this.prisma.template.findMany({
      where: { organizationId, channel: 'WHATSAPP' },
    });
  }
}
