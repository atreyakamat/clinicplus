import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/services/audit.service';
import { assertUuid } from '../common/validation/uuid';
import { normalizePermission, normalizeRoleName } from '../auth/access.utils';
import { SYSTEM_ROLE_NAMES } from '../auth/default-access';
import {
  Actor,
  SUPER_ADMIN_ROLE,
  actorPermissionSet,
  assertCanGrant,
  isValidPermissionKey,
  rolePermissionKeys,
} from '../auth/access-policy';
import { CreateRoleDto, UpdateRoleDto } from './dto/role.dto';

const ROLE_INCLUDE = {
  rolePermissions: { include: { permission: { select: { module: true, action: true } } } },
  _count: { select: { userRoles: true } },
} as const;

const SYSTEM_NAMES = new Set(SYSTEM_ROLE_NAMES.map(normalizeRoleName));

@Injectable()
export class RolesService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  private present(role: any) {
    return {
      id: role.id,
      name: role.name,
      description: role.description ?? null,
      isSystem: !!role.isSystem,
      permissions: rolePermissionKeys(role).sort(),
      userCount: role._count?.userRoles ?? 0,
      createdAt: role.createdAt,
      updatedAt: role.updatedAt,
    };
  }

  /** Super Admin is a platform role; it is only visible to actors who hold platform access. */
  private canSeeSuperAdmin(actor: Actor) {
    return actorPermissionSet(actor).has('admin.view');
  }

  async findAll(actor: Actor) {
    const roles = await this.prisma.role.findMany({
      where: {
        organizationId: actor.organizationId,
        deletedAt: null,
        ...(this.canSeeSuperAdmin(actor) ? {} : { NOT: { name: SUPER_ADMIN_ROLE } }),
      },
      include: ROLE_INCLUDE,
      orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
    });
    return roles.map((r) => this.present(r));
  }

  private async load(id: string, organizationId: string) {
    assertUuid(id, 'roleId');
    const role = await this.prisma.role.findFirst({
      where: { id, organizationId, deletedAt: null },
      include: ROLE_INCLUDE,
    });
    if (!role) throw new NotFoundException('Role not found');
    return role;
  }

  async findOne(id: string, actor: Actor) {
    const role = await this.load(id, actor.organizationId);
    if (role.name === SUPER_ADMIN_ROLE && !this.canSeeSuperAdmin(actor)) {
      throw new NotFoundException('Role not found');
    }
    return this.present(role);
  }

  private async resolvePermissionIds(organizationId: string, keys: string[]) {
    const normalized = Array.from(new Set(keys.map(normalizePermission)));
    const unknown = normalized.filter((k) => !isValidPermissionKey(k));
    if (unknown.length) throw new BadRequestException(`Unknown permission(s): ${unknown.join(', ')}`);
    const rows = await this.prisma.permission.findMany({
      where: {
        organizationId,
        OR: normalized.map((k) => {
          const [module, action] = k.split('.');
          return { module, action };
        }),
      },
      select: { id: true, module: true, action: true },
    });
    if (normalized.length && rows.length !== normalized.length) {
      throw new BadRequestException('One or more permissions are not provisioned for this organization');
    }
    return { normalized, ids: rows.map((r) => r.id) };
  }

  private async assertNameAvailable(organizationId: string, name: string, exceptId?: string) {
    if (SYSTEM_NAMES.has(normalizeRoleName(name))) {
      throw new ConflictException('This name is reserved for a built-in role');
    }
    const clash = await this.prisma.role.findFirst({
      where: {
        organizationId,
        deletedAt: null,
        name: { equals: name, mode: 'insensitive' },
        ...(exceptId ? { NOT: { id: exceptId } } : {}),
      },
      select: { id: true },
    });
    if (clash) throw new ConflictException('A role with this name already exists');
  }

  async create(dto: CreateRoleDto, actor: Actor) {
    const orgId = actor.organizationId;
    await this.assertNameAvailable(orgId, dto.name);
    const { normalized, ids } = await this.resolvePermissionIds(orgId, dto.permissions);
    assertCanGrant(actor, normalized);

    const role = await this.prisma.$transaction(async (tx) => {
      const created = await tx.role.create({
        data: {
          organizationId: orgId,
          name: dto.name,
          description: dto.description,
          isSystem: false,
          createdBy: actor.id,
        },
      });
      if (ids.length) {
        await tx.rolePermission.createMany({
          data: ids.map((permissionId) => ({ organizationId: orgId, roleId: created.id, permissionId })),
        });
      }
      return created;
    });

    await this.audit.log({
      organizationId: orgId,
      userId: actor.id,
      action: 'ROLE_CREATE',
      resource: 'role',
      resourceId: role.id,
      afterData: { name: role.name, permissions: normalized },
    });
    return this.findOne(role.id, actor);
  }

  /** Common guards for mutating a custom role. */
  private async loadMutable(id: string, actor: Actor) {
    const role = await this.load(id, actor.organizationId);
    if (role.isSystem || SYSTEM_NAMES.has(normalizeRoleName(role.name))) {
      throw new ForbiddenException('Built-in roles are read-only; create a custom role instead');
    }
    const held = await this.prisma.userRole.findFirst({ where: { roleId: role.id, userId: actor.id }, select: { id: true } });
    if (held) throw new ForbiddenException('You cannot modify a role that is assigned to yourself');
    // Editing a role whose current access exceeds yours would let you strip/redistribute it.
    assertCanGrant(actor, rolePermissionKeys(role), 'modify a role holding');
    return role;
  }

  async update(id: string, dto: UpdateRoleDto, actor: Actor) {
    const orgId = actor.organizationId;
    const before = await this.loadMutable(id, actor);
    if (dto.name && dto.name.toLowerCase() !== before.name.toLowerCase()) {
      await this.assertNameAvailable(orgId, dto.name, id);
    }
    let resolved: { normalized: string[]; ids: string[] } | null = null;
    if (dto.permissions) {
      resolved = await this.resolvePermissionIds(orgId, dto.permissions);
      assertCanGrant(actor, resolved.normalized);
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.role.update({
        where: { id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name } : {}),
          ...(dto.description !== undefined ? { description: dto.description } : {}),
          updatedBy: actor.id,
        },
      });
      if (resolved) {
        await tx.rolePermission.deleteMany({ where: { roleId: id, permissionId: { notIn: resolved.ids } } });
        const existing = await tx.rolePermission.findMany({ where: { roleId: id }, select: { permissionId: true } });
        const have = new Set(existing.map((e) => e.permissionId));
        const add = resolved.ids.filter((pid) => !have.has(pid));
        if (add.length) {
          await tx.rolePermission.createMany({
            data: add.map((permissionId) => ({ organizationId: orgId, roleId: id, permissionId })),
          });
        }
      }
    });

    const after = await this.findOne(id, actor);
    await this.audit.log({
      organizationId: orgId,
      userId: actor.id,
      action: 'ROLE_UPDATE',
      resource: 'role',
      resourceId: id,
      beforeData: { name: before.name, description: before.description, permissions: rolePermissionKeys(before).sort() },
      afterData: { name: after.name, description: after.description, permissions: after.permissions },
    });
    return after;
  }

  async remove(id: string, actor: Actor) {
    const role = await this.loadMutable(id, actor);
    const holders = await this.prisma.userRole.count({ where: { roleId: id } });
    if (holders > 0) {
      throw new ConflictException(`This role is assigned to ${holders} user(s); reassign them before deleting it`);
    }
    await this.prisma.$transaction([
      this.prisma.rolePermission.deleteMany({ where: { roleId: id } }),
      this.prisma.staffInvitation.updateMany({
        where: { organizationId: actor.organizationId, roleId: id, status: 'PENDING' },
        data: { status: 'REVOKED' },
      }),
      this.prisma.role.delete({ where: { id } }),
    ]);
    await this.audit.log({
      organizationId: actor.organizationId,
      userId: actor.id,
      action: 'ROLE_DELETE',
      resource: 'role',
      resourceId: id,
      beforeData: { name: role.name, permissions: rolePermissionKeys(role).sort() },
    });
    return { message: 'Role deleted' };
  }
}
