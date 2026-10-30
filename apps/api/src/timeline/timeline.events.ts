/** Timeline categories. Each one is gated by a permission when the timeline is read. */
export type TimelineCategory =
  | 'PATIENT'
  | 'APPOINTMENT'
  | 'CLINICAL'
  | 'PRESCRIPTION'
  | 'DOCUMENT'
  | 'BILLING'
  | 'COMMUNICATION'
  | 'FOLLOW_UP'
  | 'SYSTEM';

export const TIMELINE_CATEGORIES: TimelineCategory[] = [
  'PATIENT',
  'APPOINTMENT',
  'CLINICAL',
  'PRESCRIPTION',
  'DOCUMENT',
  'BILLING',
  'COMMUNICATION',
  'FOLLOW_UP',
];

/** Typed events emitted by services. The value is the event's category. */
export const TIMELINE_EVENTS = {
  PATIENT_REGISTERED: 'PATIENT',
  PATIENT_UPDATED: 'PATIENT',
  PATIENT_ARCHIVED: 'PATIENT',
  PATIENT_RESTORED: 'PATIENT',
  PATIENT_NOTE_ADDED: 'PATIENT',

  CONSULTATION_STARTED: 'CLINICAL',
  CONSULTATION_COMPLETED: 'CLINICAL',
  CONSULTATION_ADDENDUM: 'CLINICAL',
  VITALS_RECORDED: 'CLINICAL',
  DIAGNOSIS_ADDED: 'CLINICAL',
  ALLERGY_ADDED: 'CLINICAL',
  ALLERGY_REMOVED: 'CLINICAL',
  CONDITION_ADDED: 'CLINICAL',
  CONDITION_UPDATED: 'CLINICAL',

  PRESCRIPTION_ISSUED: 'PRESCRIPTION',
  PRESCRIPTION_UPDATED: 'PRESCRIPTION',
  PRESCRIPTION_CANCELLED: 'PRESCRIPTION',

  DOCUMENT_UPLOADED: 'DOCUMENT',
  DOCUMENT_DELETED: 'DOCUMENT',
} as const satisfies Record<string, TimelineCategory>;

export type TimelineEventType = keyof typeof TIMELINE_EVENTS;

/**
 * Legacy rows written by the generic TimelineInterceptor carry category SYSTEM.
 * They are mapped to a real category by event-type prefix so permission gating
 * still applies to them.
 */
export const SYSTEM_PREFIX_CATEGORY: Array<[string, TimelineCategory]> = [
  ['APPOINTMENT_', 'APPOINTMENT'],
  ['CONSULTATION_', 'CLINICAL'],
  ['PRESCRIPTION_', 'PRESCRIPTION'],
  ['INVOICE_', 'BILLING'],
  ['PAYMENT_', 'BILLING'],
];

/**
 * Generic interceptor rows that duplicate the typed events emitted by the
 * consultation / prescription services; hidden from the timeline.
 */
export const SUPERSEDED_SYSTEM_EVENTS = ['CONSULTATION_STARTED', 'CONSULTATION_UPDATED', 'PRESCRIPTION_GENERATED'];

/** Permission keys (any-of) required to see a category. Empty = timeline.view is enough. */
export const CATEGORY_PERMISSIONS: Record<TimelineCategory, string[]> = {
  PATIENT: [],
  APPOINTMENT: ['appointments.view'],
  CLINICAL: ['clinical.view', 'consultations.view'],
  PRESCRIPTION: ['prescriptions.view'],
  DOCUMENT: ['documents.view'],
  BILLING: ['invoices.view', 'payments.view'],
  COMMUNICATION: ['messages.view'],
  FOLLOW_UP: ['follow_ups.view'],
  SYSTEM: [],
};
