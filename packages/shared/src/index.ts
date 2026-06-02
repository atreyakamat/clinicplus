export const ROLE_NAMES = [
  'Super Admin',
  'Organization Owner',
  'Clinic Admin',
  'Branch Manager',
  'Doctor',
  'Receptionist',
  'Nurse',
  'Accountant',
  'Patient',
] as const

export const PERMISSION_ACTIONS = [
  'view',
  'create',
  'edit',
  'delete',
  'export',
  'approve',
  'assign',
  'manage',
] as const

export const MODULES = [
  'organizations',
  'branches',
  'users',
  'roles',
  'permissions',
  'patients',
  'appointments',
  'queue',
  'consultations',
  'prescriptions',
  'documents',
  'followups',
  'billing',
  'communications',
  'reviews',
  'analytics',
  'tasks',
  'settings',
  'audit',
] as const

export type ModuleName = (typeof MODULES)[number]
export type PermissionAction = (typeof PERMISSION_ACTIONS)[number]

export const buildPermission = (module: ModuleName, action: PermissionAction) =>
  `${module}:${action}`
