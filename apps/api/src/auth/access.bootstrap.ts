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
          data: { branchId: branchId, isSystem: true },
        });
      }
      return db.role.create({
        data: { organizationId, branchId: branchId, name: roleName, isSystem: true },
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

    const wantedIds = permissionKeys
      .map((key) => permissionByKey.get(normalizePermission(key))?.id)
      .filter(Boolean);
    // Built-in roles mirror DEFAULT_ROLE_PERMISSIONS exactly: drop grants that
    // were removed from the matrix so a downgrade actually takes effect.
    await db.rolePermission.deleteMany({
      where: { roleId: role.id, permissionId: { notIn: wantedIds } },
    });

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

/**
 * Re-applies the built-in role matrix to every organization. Run at boot so a
 * deploy that changes default-access.ts updates existing tenants.
 */
export async function syncAllOrganizationsAccess(db: any) {
  const orgs = await db.organization.findMany({ select: { id: true } });
  for (const org of orgs) {
    await ensureOrganizationAccess(db, org.id, null);
  }
  return orgs.length;
}
