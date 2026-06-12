import { Injectable, Logger } from '@nestjs/common';
import { AppointmentReminderService } from '../appointments/appointment-reminder.service';
import { FollowUpReminderService } from '../follow-ups/follow-up-reminder.service';

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    private appointmentReminderService: AppointmentReminderService,
    private followUpReminderService: FollowUpReminderService,
  ) {}

  /**
   * Send all scheduled notifications
   * This method should be called periodically (e.g., every hour) via a cron job
   */
  async sendScheduledNotifications() {
    this.logger.log('Running scheduled notifications');

    try {
      // Send 24-hour appointment reminders
      await this.appointmentReminderService.send24HourReminders();
      this.logger.log('Completed 24-hour appointment reminders');
    } catch (error) {
      this.logger.error('Failed to send 24-hour appointment reminders:', error);
    }

    try {
      // Send 2-hour appointment reminders
      await this.appointmentReminderService.send2HourReminders();
      this.logger.log('Completed 2-hour appointment reminders');
    } catch (error) {
      this.logger.error('Failed to send 2-hour appointment reminders:', error);
    }

    try {
      // Send tomorrow follow-up reminders
      await this.followUpReminderService.sendTomorrowFollowUpReminders();
      this.logger.log('Completed tomorrow follow-up reminders');
    } catch (error) {
      this.logger.error('Failed to send tomorrow follow-up reminders:', error);
    }

    try {
      // Send today follow-up reminders
      await this.followUpReminderService.sendTodayFollowUpReminders();
      this.logger.log('Completed today follow-up reminders');
    } catch (error) {
      this.logger.error('Failed to send today follow-up reminders:', error);
    }
  }

  /**
   * Send appointment reminders for specific time windows
   */
  async sendAppointmentRemindersForHours(hoursBefore: number) {
    return this.appointmentReminderService.sendAppointmentReminders(hoursBefore);
  }

  /**
   * Send follow-up reminders for specific days
   */
  async sendFollowUpRemindersForDays(daysBefore: number) {
    return this.followUpReminderService.sendFollowUpReminders(daysBefore);
  }
}