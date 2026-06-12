import { AppointmentReminderService } from '../appointments/appointment-reminder.service';
import { FollowUpReminderService } from '../follow-ups/follow-up-reminder.service';
export declare class NotificationService {
    private appointmentReminderService;
    private followUpReminderService;
    private readonly logger;
    constructor(appointmentReminderService: AppointmentReminderService, followUpReminderService: FollowUpReminderService);
    sendScheduledNotifications(): Promise<void>;
    sendAppointmentRemindersForHours(hoursBefore: number): Promise<void>;
    sendFollowUpRemindersForDays(daysBefore: number): Promise<void>;
}
