import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MessagesService } from '../messages/messages.service';

@Injectable()
export class FollowUpReminderService {
  private readonly logger = new Logger(FollowUpReminderService.name);

  constructor(
    private prisma: PrismaService,
    private messagesService: MessagesService,
  ) {}

  /**
   * Send follow-up reminders for follow-ups scheduled for the specified date
   * @param daysBefore How many days before the follow-up to send the reminder
   */
  async sendFollowUpReminders(daysBefore: number) {
    const now = new Date();
    const targetDate = new Date(now.getTime() + daysBefore * 24 * 60 * 60 * 1000);
    targetDate.setHours(0, 0, 0, 0); // Set to start of day

    const startOfDay = targetDate;
    const endOfDay = new Date(targetDate.getTime() + 24 * 60 * 60 * 1000 - 1); // End of day

    // Find follow-ups scheduled for the target date
    const followUps = await this.prisma.followUp.findMany({
      where: {
        scheduledDate: {
          gte: startOfDay,
          lte: endOfDay,
        },
        // Assuming we only want to send reminders for scheduled follow-ups
        // status could be checked here if there's a status field
      },
      include: {
        patient: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phone: true,
          },
        },
        doctor: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
        consultation: {
          select: {
            id: true,
          },
        },
      },
    });

    for (const followUp of followUps) {
      try {
        const patientName = `${followUp.patient.firstName} ${followUp.patient.lastName || ''}`.trim();
        const doctorName = `Dr. ${followUp.doctor.firstName} ${followUp.doctor.lastName || ''}`.trim();
        const followUpDate = followUp.scheduledDate.toLocaleDateString();

        const messageContent = `Reminder: You have a follow-up appointment with ${doctorName} on ${followUpDate}. Patient: ${patientName}`;

        // Try to send via WhatsApp first, then SMS if WhatsApp fails
        try {
          await this.messagesService.sendWhatsApp(
            followUp.patient.id,
            messageContent,
            /* organizationId and branchId would come from followUp */ '',
            '',
          );
          this.logger.log(`Follow-up reminder sent via WhatsApp for follow-up ${followUp.id}`);
        } catch (whatsappError) {
          this.logger.warn(`WhatsApp failed for follow-up ${followUp.id}, trying SMS: ${whatsappError.message}`);

          try {
            await this.messagesService.sendSms(
              followUp.patient.id,
              messageContent,
              /* organizationId and branchId would come from followUp */ '',
              '',
            );
            this.logger.log(`Follow-up reminder sent via SMS for follow-up ${followUp.id}`);
          } catch (smsError) {
            this.logger.error(`Both WhatsApp and SMS failed for follow-up ${followUp.id}:`, smsError);
          }
        }
      } catch (error) {
        this.logger.error(`Failed to process follow-up reminder for follow-up ${followUp.id}:`, error);
      }
    }
  }

  /**
   * Send follow-up reminders for follow-ups scheduled for tomorrow
   */
  async sendTomorrowFollowUpReminders() {
    this.logger.log('Sending tomorrow follow-up reminders');
    return this.sendFollowUpReminders(1);
  }

  /**
   * Send follow-up reminders for follow-ups scheduled for today
   */
  async sendTodayFollowUpReminders() {
    this.logger.log('Sending today follow-up reminders');
    return this.sendFollowUpReminders(0);
  }
}