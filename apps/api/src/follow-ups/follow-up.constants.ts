/** FollowUp.status is a free string column; these are the only values the API writes. */
export const FOLLOW_UP_STATUS = {
  PENDING: 'PENDING',
  SCHEDULED: 'SCHEDULED',
  COMPLETED: 'COMPLETED',
  MISSED: 'MISSED',
  CANCELLED: 'CANCELLED',
} as const;

export type FollowUpStatus = (typeof FOLLOW_UP_STATUS)[keyof typeof FOLLOW_UP_STATUS];
export const FOLLOW_UP_STATUSES = Object.values(FOLLOW_UP_STATUS) as FollowUpStatus[];

/** Statuses that still expect the patient to come back. Legacy rows may have a NULL status (= PENDING). */
export const OPEN_FOLLOW_UP_STATUSES: FollowUpStatus[] = ['PENDING', 'SCHEDULED'];

/** Allowed manual transitions. COMPLETED is terminal; CANCELLED can be reopened. */
export const FOLLOW_UP_TRANSITIONS: Record<FollowUpStatus, FollowUpStatus[]> = {
  PENDING: ['SCHEDULED', 'COMPLETED', 'MISSED', 'CANCELLED'],
  SCHEDULED: ['PENDING', 'COMPLETED', 'MISSED', 'CANCELLED'],
  MISSED: ['PENDING', 'SCHEDULED', 'COMPLETED', 'CANCELLED'],
  CANCELLED: ['PENDING'],
  COMPLETED: [],
};

export function normalizeFollowUpStatus(status: string | null | undefined): FollowUpStatus {
  return (FOLLOW_UP_STATUSES as string[]).includes(status ?? '') ? (status as FollowUpStatus) : 'PENDING';
}

/** Hours after the due date before an un-actioned follow-up counts as MISSED. */
export const FOLLOW_UP_MISSED_GRACE_HOURS = 48;

export const FOLLOW_UP_OUTCOMES = [
  'RECOVERED',
  'IMPROVING',
  'NO_CHANGE',
  'WORSENED',
  'NEEDS_VISIT',
  'REFERRED',
  'UNREACHABLE',
  'OTHER',
] as const;
