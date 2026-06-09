export const normalizeRoleName = (value?: string | null) =>
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

export const serializePermission = (module: string, action: string) =>
  normalizePermission(`${module}.${action}`);

export const extractRoleNames = (roles: any[] = []) =>
  roles
    .map((role) => {
      if (typeof role === 'string') {
        return role;
      }

      return role?.role?.name ?? role?.name;
    })
    .filter(Boolean);

export const extractPermissionNames = (roles: any[] = []) =>
  Array.from(
    new Set(
      roles.flatMap((role) => {
        const rolePermissions =
          role?.role?.rolePermissions ?? role?.rolePermissions ?? [];
        return rolePermissions
          .map((item) => item?.permission)
          .filter(Boolean)
          .map((permission) =>
            serializePermission(permission.module, permission.action),
          );
      }),
    ),
  );
