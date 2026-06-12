import { Injectable, Logger } from '@nestjs/common';
import { NotificationService } from '../notifications/notification.service';

@Injectable()
export class TaskSchedulerService {
  private readonly logger = new Logger(TaskSchedulerService.name);
  private notificationInterval: NodeJS.Timeout;

  constructor(private notificationService: NotificationService) {}

  /**
   * Start the task scheduler
   * Runs notification checks every hour
   */
  start() {
    this.logger.log('Starting task scheduler');

    // Run immediately on start
    this.runNotificationJob();

    // Then run every hour
    this.notificationInterval = setInterval(() => {
      this.runNotificationJob();
    }, 60 * 60 * 1000); // 1 hour
  }

  /**
   * Stop the task scheduler
   */
  stop() {
    this.logger.log('Stopping task scheduler');
    if (this.notificationInterval) {
      clearInterval(this.notificationInterval);
    }
  }

  /**
   * Run the notification job
   */
  private async runNotificationJob() {
    try {
      this.logger.log('Running scheduled notification job');
      await this.notificationService.sendScheduledNotifications();
      this.logger.log('Completed scheduled notification job');
    } catch (error) {
      this.logger.error('Failed to run scheduled notification job:', error);
    }
  }
}