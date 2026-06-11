import {
  DEFAULT_PERMISSIONS,
  DEFAULT_ROLE_PERMISSIONS,
} from './default-access';
import { normalizePermission } from './access.utils';

export async function ensureOrganizationAccess(
  db: any,
  organizationId: string,
  branchId: string | null = null,
) {
  const permissions = await Promise.all(
    DEFAULT_PERMISSIONS.map((permission) =>
      db.permission.upsert({
        where: {
          module_action_organizationId: {
            module: permission.module,
            action: permission.action,
            organizationId,
          },
        },
        update: {
          description: permission.description,
          branchId: branchId ?? null,
        },
        create: {
          organizationId,
          branchId: branchId ?? null,
          module: permission.module,
          action: permission.action,
          description: permission.description,
        },
      }),
    ),
  );

  const permissionByKey = new Map(
    permissions.map((permission) => [
      normalizePermission(`${permission.module}.${permission.action}`),
      permission,
    ]),
  );

  const roles = await Promise.all(
    Object.keys(DEFAULT_ROLE_PERMISSIONS).map(async (roleName) => {
      const existing = await db.role.findFirst({
        where: { organizationId, name: roleName, branchId: branchId },
      });
      if (existing) {
        return db.role.update({
          where: { id: existing.id },
          data: { branchId: branchId },
        });
      }
      return db.role.create({
        data: { organizationId, branchId: branchId, name: roleName },
      });
    }),
  );

  const rolesByName = new Map(roles.map((role) => [role.name, role]));

  for (const [roleName, permissionKeys] of Object.entries(
    DEFAULT_ROLE_PERMISSIONS,
  )) {
    const role = rolesByName.get(roleName);

    if (!role) {
      continue;
    }

    for (const permissionKey of permissionKeys) {
      const permission = permissionByKey.get(
        normalizePermission(permissionKey),
      );

      if (!permission) {
        continue;
      }

      await db.rolePermission.upsert({
        where: {
          roleId_permissionId: {
            roleId: role.id,
            permissionId: permission.id,
          },
        },
        update: {
          branchId: branchId ?? null,
        },
        create: {
          organizationId,
          branchId: branchId ?? null,
          roleId: role.id,
          permissionId: permission.id,
        },
      });
    }
  }

  return {
    permissions,
    rolesByName,
  };
}
