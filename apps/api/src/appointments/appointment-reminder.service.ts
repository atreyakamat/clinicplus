import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MessagesService } from '../messages/messages.service';

@Injectable()
export class AppointmentReminderService {
  private readonly logger = new Logger(AppointmentReminderService.name);

  constructor(
    private prisma: PrismaService,
    private messagesService: MessagesService,
  ) {}

  /**
   * Send appointment reminders for appointments starting in the specified time window
   * @param hoursBefore How many hours before the appointment to send the reminder
   */
  async sendAppointmentReminders(hoursBefore: number) {
    const now = new Date();
    const targetTime = new Date(now.getTime() + hoursBefore * 60 * 60 * 1000);

    // Find appointments that start within a small window around targetTime
    // (e.g., within 5 minutes of the target time to account for processing delays)
    const windowStart = new Date(targetTime.getTime() - 5 * 60 * 1000); // 5 minutes before
    const windowEnd = new Date(targetTime.getTime() + 5 * 60 * 1000); // 5 minutes after

    const appointments = await this.prisma.appointment.findMany({
      where: {
        scheduledStart: {
          gte: windowStart,
          lte: windowEnd,
        },
        status: 'SCHEDULED',
        // Assuming we only want to send reminders for confirmed appointments
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
      },
    });

    for (const appointment of appointments) {
      try {
        const patientName =
          `${appointment.patient.firstName} ${appointment.patient.lastName || ''}`.trim();
        const doctorName =
          `Dr. ${appointment.doctor.firstName} ${appointment.doctor.lastName || ''}`.trim();
        const appointmentTime = appointment.scheduledStart.toLocaleString();

        const messageContent = `Reminder: You have an appointment with ${doctorName} on ${appointmentTime}. Patient: ${patientName}`;

        // Try to send via WhatsApp first, then SMS if WhatsApp fails
        try {
          await this.messagesService.sendWhatsApp(
            appointment.patient.id,
            messageContent,
            /* organizationId and branchId would come from appointment */ '',
            '',
          );
          this.logger.log(
            `Appointment reminder sent via WhatsApp for appointment ${appointment.id}`,
          );
        } catch (whatsappError) {
          this.logger.warn(
            `WhatsApp failed for appointment ${appointment.id}, trying SMS: ${whatsappError.message}`,
          );

          try {
            await this.messagesService.sendSms(
              appointment.patient.id,
              messageContent,
              /* organizationId and branchId would come from appointment */ '',
              '',
            );
            this.logger.log(
              `Appointment reminder sent via SMS for appointment ${appointment.id}`,
            );
          } catch (smsError) {
            this.logger.error(
              `Both WhatsApp and SMS failed for appointment ${appointment.id}:`,
              smsError,
            );
          }
        }
      } catch (error) {
        this.logger.error(
          `Failed to process appointment reminder for appointment ${appointment.id}:`,
          error,
        );
      }
    }
  }

  /**
   * Send 24-hour appointment reminders
   */
  async send24HourReminders() {
    this.logger.log('Sending 24-hour appointment reminders');
    return this.sendAppointmentReminders(24);
  }

  /**
   * Send 2-hour appointment reminders
   */
  async send2HourReminders() {
    this.logger.log('Sending 2-hour appointment reminders');
    return this.sendAppointmentReminders(2);
  }
}
