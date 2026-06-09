export const normalizeRole = (value?: string | null) =>
  (value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, '-');

export const normalizePermission = (value?: string | null) => {
  if (!value) {
    return '';
  }

  const raw = value.trim().toLowerCase();
  const [module, action] = raw.split(/[:.]/).filter(Boolean);

  if (!module || !action) {
    return raw.replace(/:/g, '.').replace(/[-\s]+/g, '_');
  }

  return `${module.replace(/[-\s]+/g, '_')}.${action.replace(/[-\s]+/g, '_')}`;
};

export const hasRole = (roles: string[] | undefined, requiredRole: string) =>
  new Set((roles ?? []).map(normalizeRole)).has(normalizeRole(requiredRole));

export const hasPermission = (permissions: string[] | undefined, requiredPermission: string) =>
  new Set((permissions ?? []).map(normalizePermission)).has(normalizePermission(requiredPermission));
