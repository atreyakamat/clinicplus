import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SmsService } from './sms.service';

@Injectable()
export class MessagesService {
  constructor(
    private prisma: PrismaService,
    private smsService: SmsService,
  ) {}

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

  async sendSms(
    patientId: string,
    content: string,
    organizationId: string,
    branchId: string,
  ) {
    // Get patient phone number
    const patient = await this.prisma.patient.findUnique({
      where: { id: patientId },
      select: { phone: true },
    });

    if (!patient?.phone) {
      throw new BadRequestException('Patient phone number not found');
    }

    const smsResult = await this.smsService.sendSms(
      patient.phone,
      content,
      organizationId,
      branchId,
    );

    // Create message record with delivery status based on SMS result
    const message = await this.prisma.message.create({
      data: {
        patientId,
        messageBody: content,
        channel: 'SMS',
        direction: 'OUTBOUND',
        deliveryStatus: smsResult.success ? 'SENT' : 'FAILED',
        organizationId,
        branchId,
      },
    });

    // Return message with additional gateway info for logging/tracking
    return {
      ...message,
      gatewayMessageId: smsResult.messageId,
      gatewayError: smsResult.error,
    };
  }

  async getTemplates(organizationId: string) {
    return this.prisma.template.findMany({
      where: {
        organizationId,
        channel: {
          in: ['WHATSAPP', 'SMS'],
        },
      },
    });
  }
}
