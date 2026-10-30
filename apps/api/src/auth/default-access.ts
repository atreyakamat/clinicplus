/**
 * Canonical permission catalog.
 *
 * Permission keys are `module.action`. Controllers reference them through the
 * `@Permissions('module.action')` decorator (`normalizePermission` also accepts
 * `module:action`). Every key used by a controller MUST exist here, otherwise no
 * real user could ever be granted it (see docs/BUILD_AUDIT.md, defect AUTH-01).
 */
export const DEFAULT_PERMISSIONS = [
  { module: 'admin', action: 'view', description: 'View platform administration surfaces' },
  { module: 'analytics', action: 'view', description: 'View analytics dashboards and reports' },
  { module: 'dashboard', action: 'view', description: 'View dashboard summaries' },

  { module: 'patients', action: 'view', description: 'View patient records' },
  { module: 'patients', action: 'create', description: 'Create patient records' },
  { module: 'patients', action: 'update', description: 'Update patient records' },
  { module: 'patients', action: 'delete', description: 'Archive patient records' },
  { module: 'patients', action: 'export', description: 'Export patient lists' },
  { module: 'patients', action: 'import', description: 'Bulk import patients' },

  { module: 'appointments', action: 'view', description: 'View appointment schedules' },
  { module: 'appointments', action: 'create', description: 'Create appointments' },
  { module: 'appointments', action: 'update', description: 'Reschedule / update appointments' },
  { module: 'appointments', action: 'delete', description: 'Cancel appointments' },
  { module: 'appointments', action: 'export', description: 'Export appointment lists' },

  { module: 'queues', action: 'view', description: 'View queue status' },
  { module: 'queues', action: 'update', description: 'Check in, call and complete queue entries' },

  { module: 'consultations', action: 'view', description: 'View consultations' },
  { module: 'consultations', action: 'create', description: 'Create consultations' },
  { module: 'consultations', action: 'update', description: 'Update / complete consultations' },

  { module: 'prescriptions', action: 'view', description: 'View prescriptions' },
  { module: 'prescriptions', action: 'create', description: 'Create prescriptions' },
  { module: 'prescriptions', action: 'update', description: 'Update prescriptions' },

  { module: 'documents', action: 'view', description: 'View and download medical documents' },
  { module: 'documents', action: 'upload', description: 'Upload medical documents' },
  { module: 'documents', action: 'update', description: 'Update document metadata' },
  { module: 'documents', action: 'delete', description: 'Delete medical documents' },

  { module: 'follow_ups', action: 'view', description: 'View follow-up records' },
  { module: 'follow_ups', action: 'create', description: 'Create follow-up records' },
  { module: 'follow_ups', action: 'update', description: 'Update follow-up records' },

  { module: 'billing', action: 'view', description: 'View billing dashboards' },
  { module: 'invoices', action: 'view', description: 'View invoices' },
  { module: 'invoices', action: 'create', description: 'Create invoices' },
  { module: 'invoices', action: 'update', description: 'Update / void invoices' },
  { module: 'payments', action: 'view', description: 'View payments' },
  { module: 'payments', action: 'create', description: 'Record payments' },
  { module: 'payments', action: 'refund', description: 'Refund payments' },

  { module: 'communications', action: 'view', description: 'View communication center' },
  { module: 'messages', action: 'view', description: 'View sent messages' },
  { module: 'messages', action: 'send', description: 'Send patient communications' },

  { module: 'feedback', action: 'view', description: 'View internal feedback' },
  { module: 'feedback', action: 'create', description: 'Create internal feedback' },
  { module: 'feedback', action: 'update', description: 'Triage internal feedback' },
  { module: 'reviews', action: 'view', description: 'View reviews and referrals' },

  { module: 'tasks', action: 'view', description: 'View tasks' },
  { module: 'tasks', action: 'create', description: 'Create tasks' },
  { module: 'tasks', action: 'update', description: 'Update tasks' },
  { module: 'tasks', action: 'delete', description: 'Cancel tasks' },

  { module: 'settings', action: 'view', description: 'View settings' },
  { module: 'settings', action: 'branding', description: 'Manage clinic branding settings' },
  { module: 'organizations', action: 'view', description: 'View organization profile' },
  { module: 'organizations', action: 'update', description: 'Update organization profile' },

  { module: 'users', action: 'view', description: 'View staff users' },
  { module: 'users', action: 'update', description: 'Update staff users' },
  { module: 'users', action: 'invite', description: 'Invite staff users' },
  { module: 'roles', action: 'view', description: 'View roles' },
  { module: 'roles', action: 'create', description: 'Create roles' },
  { module: 'roles', action: 'update', description: 'Update roles' },
  { module: 'permissions', action: 'view', description: 'View permissions' },

  { module: 'branches', action: 'view', description: 'View branches' },
  { module: 'branches', action: 'manage', description: 'Create, update and archive branches' },
  { module: 'departments', action: 'view', description: 'View departments' },
  { module: 'departments', action: 'manage', description: 'Create, update and archive departments' },
  { module: 'services', action: 'view', description: 'View the clinic service / price catalog' },
  { module: 'services', action: 'manage', description: 'Manage services, working hours and holidays' },
  { module: 'doctors', action: 'view', description: 'View doctor profiles, availability and slots' },
  { module: 'doctors', action: 'manage', description: 'Manage any doctor profile, availability and leave' },
  { module: 'doctors', action: 'update_own', description: 'Manage own doctor profile, availability and leave' },

  { module: 'vitals', action: 'view', description: 'View patient vitals' },
  { module: 'vitals', action: 'create', description: 'Record patient vitals' },
  { module: 'diagnoses', action: 'view', description: 'View diagnoses' },
  { module: 'diagnoses', action: 'create', description: 'Record and edit diagnoses' },
  { module: 'clinical', action: 'view', description: 'View allergies, conditions and medical history' },
  { module: 'clinical', action: 'update', description: 'Edit allergies, conditions and medical history' },

  { module: 'reports', action: 'view', description: 'View financial reports (outstanding, ageing, daily close)' },
  { module: 'reports', action: 'export', description: 'Export financial reports' },
  { module: 'analytics', action: 'financial', description: 'View revenue analytics' },
  { module: 'analytics', action: 'doctor', description: 'View own doctor practice analytics' },

  { module: 'templates', action: 'manage', description: 'Manage message templates' },
  { module: 'campaigns', action: 'view', description: 'View campaigns' },
  { module: 'campaigns', action: 'manage', description: 'Create and send campaigns' },
  { module: 'reviews', action: 'manage', description: 'Send review requests and manage referrals' },

  { module: 'tasks', action: 'assign', description: 'Assign tasks to other staff' },
  { module: 'workflows', action: 'manage', description: 'Manage task workflow templates' },
  { module: 'roles', action: 'delete', description: 'Delete custom roles' },
  { module: 'users', action: 'deactivate', description: 'Activate / deactivate staff accounts' },

  { module: 'timeline', action: 'view', description: 'View patient timeline' },
  { module: 'audit', action: 'view', description: 'View audit logs' },

  { module: 'backup', action: 'view', description: 'List and download backups' },
  { module: 'backup', action: 'create', description: 'Trigger backups' },
  { module: 'backup', action: 'manage', description: 'Control the backup scheduler' },
] as const;

export const ALL_PERMISSION_KEYS: string[] = DEFAULT_PERMISSIONS.map(
  (p) => `${p.module}.${p.action}`,
);

const without = (...keys: string[]) =>
  ALL_PERMISSION_KEYS.filter((k) => !keys.includes(k));

/**
 * Built-in role matrix, derived from docs/roleandpermissionrbac.md.
 *
 * Built-in roles are flagged `isSystem` and are re-synced (grants added AND
 * removed) on every boot by syncAllOrganizationsAccess, so this file is the
 * single source of truth. Clinics customise access by creating custom roles.
 *
 * Owner/Admin get read-only clinical access per the matrix; a clinician who is
 * also the owner holds both "Organization Owner" and "Doctor".
 */
const CLINICAL_WRITE = [
  'consultations.create', 'consultations.update',
  'prescriptions.create', 'prescriptions.update',
  'diagnoses.create',
];

export const DEFAULT_ROLE_PERMISSIONS: Record<string, string[]> = {
  'Super Admin': [...ALL_PERMISSION_KEYS],
  'Organization Owner': without('admin.view', ...CLINICAL_WRITE),
  'Clinic Admin': without('admin.view', 'backup.manage', 'roles.delete', ...CLINICAL_WRITE),
  'Branch Manager': [
    'dashboard.view', 'analytics.view', 'analytics.financial',
    'branches.view', 'departments.view', 'services.view', 'doctors.view', 'doctors.manage',
    'patients.view', 'patients.create', 'patients.update', 'patients.export',
    'appointments.view', 'appointments.create', 'appointments.update', 'appointments.delete', 'appointments.export',
    'queues.view', 'queues.update',
    'consultations.view', 'prescriptions.view',
    'documents.view', 'documents.upload',
    'follow_ups.view', 'follow_ups.create', 'follow_ups.update',
    'billing.view', 'invoices.view', 'invoices.create', 'invoices.update', 'payments.view', 'payments.create',
    'reports.view',
    'communications.view', 'messages.view', 'messages.send', 'campaigns.view',
    'reviews.view', 'reviews.manage',
    'feedback.view', 'feedback.create', 'feedback.update',
    'tasks.view', 'tasks.create', 'tasks.update', 'tasks.delete', 'tasks.assign',
    'settings.view', 'organizations.view', 'users.view', 'users.invite', 'users.update', 'roles.view', 'permissions.view',
    'timeline.view', 'audit.view',
  ],
  Doctor: [
    'dashboard.view', 'analytics.doctor',
    'services.view', 'doctors.view', 'doctors.update_own',
    'patients.view', 'patients.update',
    'appointments.view', 'appointments.update',
    'queues.view', 'queues.update',
    'consultations.view', 'consultations.create', 'consultations.update',
    'prescriptions.view', 'prescriptions.create', 'prescriptions.update',
    'vitals.view', 'vitals.create', 'diagnoses.view', 'diagnoses.create',
    'clinical.view', 'clinical.update',
    'documents.view', 'documents.upload',
    'follow_ups.view', 'follow_ups.create', 'follow_ups.update',
    'communications.view', 'messages.view', 'messages.send',
    'reviews.view',
    'feedback.view', 'feedback.create',
    'tasks.view', 'tasks.create', 'tasks.update',
    'timeline.view', 'settings.view', 'organizations.view',
  ],
  Receptionist: [
    'dashboard.view',
    'services.view', 'doctors.view',
    'patients.view', 'patients.create', 'patients.update',
    'appointments.view', 'appointments.create', 'appointments.update', 'appointments.delete',
    'queues.view', 'queues.update',
    'prescriptions.view',
    'documents.upload',
    'follow_ups.view', 'follow_ups.update',
    'billing.view', 'invoices.view', 'invoices.create', 'payments.view', 'payments.create',
    'communications.view', 'messages.view', 'messages.send',
    'reviews.view', 'reviews.manage',
    'feedback.view', 'feedback.create',
    'tasks.view', 'tasks.update',
    'timeline.view', 'settings.view', 'organizations.view',
  ],
  Nurse: [
    'dashboard.view',
    'doctors.view',
    'patients.view',
    'appointments.view',
    'queues.view', 'queues.update',
    'consultations.view',
    'vitals.view', 'vitals.create', 'diagnoses.view', 'clinical.view',
    'documents.view', 'documents.upload',
    'follow_ups.view', 'follow_ups.update',
    'feedback.view', 'feedback.create',
    'tasks.view', 'tasks.create', 'tasks.update',
    'timeline.view', 'settings.view',
  ],
  Accountant: [
    'dashboard.view', 'analytics.financial',
    'services.view', 'doctors.view',
    'patients.view',
    'billing.view', 'invoices.view', 'invoices.create', 'invoices.update',
    'payments.view', 'payments.create', 'payments.refund',
    'reports.view', 'reports.export',
    // Receives the automatic overdue-invoice collection tasks.
    'tasks.view', 'tasks.update',
    'feedback.view', 'feedback.create', 'settings.view', 'organizations.view',
  ],
  // There is no patient portal yet. Patient accounts get NO staff permissions:
  // every staff endpoint is clinic-wide, so any grant here would leak other
  // patients' records. Add "own data" endpoints before granting anything.
  Patient: [],
};

export const SYSTEM_ROLE_NAMES = Object.keys(DEFAULT_ROLE_PERMISSIONS);

/** Roles whose holders see every branch of their organization (and may switch branch). */
export const ORG_WIDE_ROLE_NAMES = ['Super Admin', 'Organization Owner', 'Clinic Admin'];
