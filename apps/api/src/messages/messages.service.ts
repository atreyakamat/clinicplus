import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class MessagesService {
  constructor(private prisma: PrismaService) {}

  async findAll(organizationId: string, branchId: string) {
    return this.prisma.message.findMany({
      where: { organizationId, branchId },
      include: { patient: { select: { firstName: true, lastName: true, phone: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async sendWhatsApp(patientId: string, content: string, organizationId: string, branchId: string) {
    // In a real app, integrate with WhatsApp Business API (Twilio/Gupshup)
    // For now, record the message in DB
    return this.prisma.message.create({
      data: {
        patientId,
        messageBody: content,
        channel: 'WHATSAPP',
        direction: 'OUTBOUND',
        deliveryStatus: 'SENT',
        organizationId,
        branchId,
      }
    });
  }

  async getTemplates(organizationId: string) {
    return this.prisma.template.findMany({
      where: { organizationId, channel: 'WHATSAPP' }
    });
  }
}
