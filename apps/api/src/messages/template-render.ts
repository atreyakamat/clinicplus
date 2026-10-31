/** Variables available to every message template as {{name}}. */
export const TEMPLATE_VARIABLES = [
  'patientName',
  'firstName',
  'doctorName',
  'clinicName',
  'appointmentDate',
  'appointmentTime',
  'branchName',
  'link',
] as const;
export type TemplateVariable = (typeof TEMPLATE_VARIABLES)[number];
export type TemplateVars = Partial<Record<TemplateVariable, string | null | undefined>>;

const VAR_RE = /\{\{\s*([a-zA-Z][a-zA-Z0-9_]*)\s*\}\}/g;

/** Replaces {{variable}} placeholders. Unknown or missing variables render as empty text. */
export function renderTemplate(content: string, vars: TemplateVars): string {
  return content
    .replace(VAR_RE, (_m, name: string) => {
      const v = (vars as Record<string, unknown>)[name];
      return v === undefined || v === null ? '' : String(v);
    })
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

/** Variables used in a template, in order of first appearance (used for WhatsApp ContentVariables). */
export function templateVariablesUsed(content: string): string[] {
  const out: string[] = [];
  for (const m of content.matchAll(VAR_RE)) if (!out.includes(m[1])) out.push(m[1]);
  return out;
}

export function unknownTemplateVariables(content: string): string[] {
  return templateVariablesUsed(content).filter((v) => !(TEMPLATE_VARIABLES as readonly string[]).includes(v));
}

/** Twilio ContentVariables {"1": ..., "2": ...} in order of appearance in the ClinicPlus template. */
export function contentVariablesFor(content: string, vars: TemplateVars): Record<string, string> {
  const out: Record<string, string> = {};
  templateVariablesUsed(content).forEach((name, i) => {
    const v = (vars as Record<string, unknown>)[name];
    out[String(i + 1)] = v === undefined || v === null ? '' : String(v);
  });
  return out;
}

export const TemplatePurpose = {
  APPOINTMENT_CONFIRMATION: 'APPOINTMENT_CONFIRMATION',
  APPOINTMENT_REMINDER_24H: 'APPOINTMENT_REMINDER_24H',
  APPOINTMENT_REMINDER_2H: 'APPOINTMENT_REMINDER_2H',
  APPOINTMENT_CANCELLED: 'APPOINTMENT_CANCELLED',
  FOLLOW_UP_REMINDER: 'FOLLOW_UP_REMINDER',
  REVIEW_REQUEST: 'REVIEW_REQUEST',
  PAYMENT_LINK: 'PAYMENT_LINK',
  CAMPAIGN: 'CAMPAIGN',
  CUSTOM: 'CUSTOM',
} as const;
export type TemplatePurposeValue = (typeof TemplatePurpose)[keyof typeof TemplatePurpose];
export const TEMPLATE_PURPOSES = Object.values(TemplatePurpose);

/** Seeded per organization on first template listing; also the fallback when a clinic deletes one. */
export const DEFAULT_TEMPLATES: { purpose: TemplatePurposeValue; name: string; content: string }[] = [
  {
    purpose: TemplatePurpose.APPOINTMENT_CONFIRMATION,
    name: 'Appointment confirmation',
    content:
      'Hi {{firstName}}, your appointment with {{doctorName}} at {{clinicName}} ({{branchName}}) is confirmed for {{appointmentDate}} at {{appointmentTime}}.',
  },
  {
    purpose: TemplatePurpose.APPOINTMENT_REMINDER_24H,
    name: 'Appointment reminder (24 hours)',
    content:
      'Reminder: {{firstName}}, you have an appointment with {{doctorName}} tomorrow, {{appointmentDate}} at {{appointmentTime}}, at {{clinicName}} ({{branchName}}).',
  },
  {
    purpose: TemplatePurpose.APPOINTMENT_REMINDER_2H,
    name: 'Appointment reminder (2 hours)',
    content:
      'Hi {{firstName}}, see you soon! Your appointment with {{doctorName}} is today at {{appointmentTime}} at {{clinicName}} ({{branchName}}).',
  },
  {
    purpose: TemplatePurpose.APPOINTMENT_CANCELLED,
    name: 'Appointment cancelled',
    content:
      'Hi {{firstName}}, your appointment with {{doctorName}} on {{appointmentDate}} at {{appointmentTime}} has been cancelled. Please contact {{clinicName}} to rebook.',
  },
  {
    purpose: TemplatePurpose.FOLLOW_UP_REMINDER,
    name: 'Follow-up reminder',
    content:
      'Hi {{firstName}}, {{doctorName}} at {{clinicName}} recommended a follow-up visit on {{appointmentDate}}. Please call us to book a convenient time.',
  },
  {
    purpose: TemplatePurpose.REVIEW_REQUEST,
    name: 'Review request',
    content: 'Thank you for visiting {{clinicName}}, {{firstName}}! We would love your feedback: {{link}}',
  },
  {
    purpose: TemplatePurpose.PAYMENT_LINK,
    name: 'Payment link',
    content: 'Hi {{firstName}}, here is your payment link for {{clinicName}}: {{link}}',
  },
];

export function defaultTemplateFor(purpose: string) {
  return DEFAULT_TEMPLATES.find((t) => t.purpose === purpose) ?? null;
}

export const SAMPLE_TEMPLATE_VARS: Required<TemplateVars> = {
  patientName: 'Asha Patel',
  firstName: 'Asha',
  doctorName: 'Dr. Mehta',
  clinicName: 'Your Clinic',
  appointmentDate: '12 Nov 2026',
  appointmentTime: '10:30 am',
  branchName: 'Main Branch',
  link: 'https://example.com/r/abc123',
};

export function formatInTimeZone(date: Date, timeZone: string, kind: 'date' | 'time'): string {
  const opts: Intl.DateTimeFormatOptions =
    kind === 'date' ? { day: 'numeric', month: 'short', year: 'numeric' } : { hour: 'numeric', minute: '2-digit' };
  try {
    return new Intl.DateTimeFormat('en-IN', { ...opts, timeZone }).format(date);
  } catch {
    return new Intl.DateTimeFormat('en-IN', { ...opts, timeZone: 'UTC' }).format(date);
  }
}
