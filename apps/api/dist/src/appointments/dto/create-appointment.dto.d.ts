export declare class CreateAppointmentDto {
    patientId: string;
    doctorId: string;
    scheduledStart: string;
    scheduledEnd: string;
    appointmentType?: string;
    appointmentSource?: string;
    notes?: string;
}
