import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { normalizeRoleName } from '../auth/access.utils';
import { UpdateUserDto } from './dto/update-user.dto';
import { ListUsersQueryDto } from './dto/user-admin.dto';
import { assertUuid } from '../common/validation/uuid';
import { AuditService } from '../common/services/audit.service';
import {
  Actor,
  OWNER_ROLE,
  SUPER_ADMIN_ROLE,
  assertCanGrant,
  isPrivilegedActor,
  rolePermissionKeys,
} from '../auth/access-policy';
import { ORG_WIDE_ROLE_NAMES } from '../auth/default-access';

const ROLE_INCLUDE = {
  roles: {
    include: {
      role: {
        include: { rolePermissions: { include: { permission: true } } },
      },
    },
  },
} as const;

export const USER_PUBLIC_SELECT = {
  id: true,
  organizationId: true,
  branchId: true,
  firstName: true,
  lastName: true,
  email: true,
  phone: true,
  avatarUrl: true,
  lastLoginAt: true,
  status: true,
  qualification: true,
  specialization: true,
  registrationNumber: true,
  experienceYears: true,
  bio: true,
  consultationFee: true,
  signatureUrl: true,
  createdAt: true,
  updatedAt: true,
  roles: { select: { id: true, role: { select: { id: true, name: true } } } },
} as const;

const USER_ADMIN_SELECT = {
  ...USER_PUBLIC_SELECT,
  branch: { select: { id: true, name: true } },
} as const;

/** Lightweight user representation for dropdowns (avoids large avatar/signature blobs). */
const USER_LIST_SELECT = {
  id: true,
  organizationId: true,
  branchId: true,
  firstName: true,
  lastName: true,
  email: true,
  phone: true,
  lastLoginAt: true,
  status: true,
  qualification: true,
  specialization: true,
  consultationFee: true,
  createdAt: true,
  branch: { select: { id: true, name: true } },
  roles: { select: { id: true, role: { select: { id: true, name: true, isSystem: true } } } },
} as const;

const revokeSessionsData = () => ({ status: 'INACTIVE' as const, logoutAt: new Date(), refreshTokenHash: null });

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  /** Login lookup. E-mails are stored lower-cased; compare case-insensitively for legacy rows. */
  async findByEmail(email: string) {
    return this.prisma.user.findFirst({
      where: { email: { equals: email.trim(), mode: 'insensitive' }, status: 'ACTIVE' },
      include: ROLE_INCLUDE,
    });
  }

  /** Per-request principal lookup used by JwtStrategy. */
  async findActiveById(id: string) {
    return this.prisma.user.findFirst({
      where: { id, status: 'ACTIVE' },
      include: ROLE_INCLUDE,
    });
  }

  /**
   * Staff directory. Branch-level actors (not orgWide) only ever see users of
   * their home branch; org-wide actors see the active branch, or every branch
   * with allBranches=true.
   */
  async findAll(organizationId: string, branchId?: string, role?: string, opts: { status?: string; search?: string } = {}) {
    const status = (opts.status ?? 'ACTIVE').toUpperCase();
    const where: Prisma.UserWhereInput = {
      organizationId,
      ...(branchId ? { branchId } : {}),
      ...(status === 'ALL' ? { status: { in: ['ACTIVE', 'INACTIVE'] } } : { status: status as any }),
    };
    if (opts.search?.trim()) {
      const q = opts.search.trim();
      where.OR = [
        { firstName: { contains: q, mode: 'insensitive' } },
        { lastName: { contains: q, mode: 'insensitive' } },
        { email: { contains: q, mode: 'insensitive' } },
        { phone: { contains: q } },
      ];
    }
    const users = await this.prisma.user.findMany({
      where,
      select: USER_LIST_SELECT,
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
      take: 1000,
    });
    if (!role) return users;
    const normalizedRole = normalizeRoleName(role);
    return users.filter((user) =>
      user.roles.some((entry) => normalizeRoleName(entry.role.name) === normalizedRole),
    );
  }

  list(actor: Actor, q: ListUsersQueryDto) {
    const branchId = actor.orgWide
      ? q.allBranches === 'true'
        ? undefined
        : actor.branchId
      : actor.homeBranchId ?? actor.branchId;
    return this.findAll(actor.organizationId, branchId, q.role, { status: q.status, search: q.search });
  }

  async findOne(id: string, organizationId: string) {
    assertUuid(id, 'userId');
    const user = await this.prisma.user.findFirst({
      where: { id, organizationId, status: 'ACTIVE' },
      select: USER_ADMIN_SELECT,
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  /** Any non-archived user, restricted to the actor's branch unless the actor is org-wide. */
  private async findManaged(id: string, actor: Actor) {
    assertUuid(id, 'userId');
    const user = await this.prisma.user.findFirst({
      where: {
        id,
        organizationId: actor.organizationId,
        status: { in: ['ACTIVE', 'INACTIVE'] },
        ...(actor.orgWide ? {} : { branchId: actor.homeBranchId ?? actor.branchId }),
      },
      select: USER_ADMIN_SELECT,
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async findOneScoped(id: string, actor: Actor) {
    return this.findManaged(id, actor);
  }

  /** Permission keys currently held by a user through all of their roles. */
  private async heldPermissionKeys(userId: string) {
    const roles = await this.prisma.userRole.findMany({
      where: { userId },
      include: { role: { include: { rolePermissions: { include: { permission: true } } } } },
    });
    return {
      roleNames: roles.map((r) => r.role.name),
      keys: Array.from(new Set(roles.flatMap((r) => rolePermissionKeys(r.role)))),
    };
  }

  /**
   * Hierarchy guard: only an Owner / Super Admin may administer an Owner or
   * Super Admin, and branch-level actors may not administer org-wide staff.
   */
  private async assertCanAdminister(targetId: string, actor: Actor, what: string) {
    const { roleNames } = await this.heldPermissionKeys(targetId);
    const names = new Set(roleNames.map(normalizeRoleName));
    const protectedTarget = names.has(normalizeRoleName(OWNER_ROLE)) || names.has(normalizeRoleName(SUPER_ADMIN_ROLE));
    if (names.has(normalizeRoleName(SUPER_ADMIN_ROLE))) {
      assertCanGrant(actor, ['admin.view'], `${what} a platform administrator with`);
    }
    if (protectedTarget && !isPrivilegedActor(actor)) {
      throw new ForbiddenException(`Only an Organization Owner can ${what} an owner account`);
    }
    if (!actor.orgWide && ORG_WIDE_ROLE_NAMES.some((r) => names.has(normalizeRoleName(r)))) {
      throw new ForbiddenException(`You cannot ${what} organization-wide administrators`);
    }
  }

  private async activeOwnerCount(organizationId: string) {
    return this.prisma.user.count({
      where: {
        organizationId,
        status: 'ACTIVE',
        roles: { some: { role: { name: OWNER_ROLE } } },
      },
    });
  }

  private async isOwner(userId: string) {
    return !!(await this.prisma.userRole.findFirst({ where: { userId, role: { name: OWNER_ROLE } }, select: { id: true } }));
  }

  /**
   * Profile update. Staff may edit their own profile; editing other users
   * requires the users.update permission (checked by the controller) and the
   * target must be within the actor's scope.
   */
  async update(id: string, data: UpdateUserDto, actor: Actor) {
    const isSelf = id === actor.id;
    const before = isSelf ? await this.findOne(id, actor.organizationId) : await this.findManaged(id, actor);
    if (!isSelf) await this.assertCanAdminister(id, actor, 'edit');
    const user = await this.prisma.user.update({
      where: { id },
      data: { ...data, updatedBy: actor.id },
      select: USER_ADMIN_SELECT,
    });
    await this.audit.log({
      organizationId: actor.organizationId,
      userId: actor.id,
      action: 'UPDATE',
      resource: 'user',
      resourceId: id,
      beforeData: before,
      afterData: user,
    });
    return user;
  }

  async deactivate(id: string, actor: Actor) {
    if (id === actor.id) throw new ForbiddenException('You cannot deactivate your own account');
    const target = await this.findManaged(id, actor);
    if (target.status === 'INACTIVE') return { message: 'User already inactive' };
    await this.assertCanAdminister(id, actor, 'deactivate');
    if ((await this.isOwner(id)) && (await this.activeOwnerCount(actor.organizationId)) <= 1) {
      throw new ForbiddenException('The last Organization Owner cannot be deactivated');
    }
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id }, data: { status: 'INACTIVE', updatedBy: actor.id } }),
      this.prisma.userSession.updateMany({ where: { userId: id, status: 'ACTIVE' }, data: revokeSessionsData() }),
    ]);
    await this.audit.log({ organizationId: actor.organizationId, userId: actor.id, action: 'DEACTIVATE', resource: 'user', resourceId: id });
    return { message: 'User deactivated' };
  }

  async activate(id: string, actor: Actor) {
    const target = await this.findManaged(id, actor);
    if (target.status === 'ACTIVE') return { message: 'User already active' };
    await this.assertCanAdminister(id, actor, 'activate');
    const clash = await this.prisma.user.findFirst({
      where: { email: { equals: target.email, mode: 'insensitive' }, status: 'ACTIVE', NOT: { id } },
      select: { id: true },
    });
    if (clash) throw new ConflictException('Another active account uses this e-mail address');
    await this.prisma.user.update({ where: { id }, data: { status: 'ACTIVE', deletedAt: null, deletedBy: null, updatedBy: actor.id } });
    await this.audit.log({ organizationId: actor.organizationId, userId: actor.id, action: 'ACTIVATE', resource: 'user', resourceId: id });
    return { message: 'User activated' };
  }

  /**
   * Replaces a user's roles. Anti-escalation: nobody changes their own roles;
   * the actor must hold every permission of the assigned roles AND of the
   * target's current roles (Owner/Super Admin exempt, except platform access);
   * the last active Organization Owner keeps the Owner role.
   */
  async setRoles(id: string, roleIds: string[], actor: Actor) {
    if (id === actor.id) throw new ForbiddenException('You cannot change your own roles');
    const target = await this.findManaged(id, actor);
    const roles = await this.prisma.role.findMany({
      where: { id: { in: roleIds }, organizationId: actor.organizationId, deletedAt: null },
      include: { rolePermissions: { include: { permission: true } } },
    });
    if (roles.length !== new Set(roleIds).size) throw new NotFoundException('One or more roles not found');
    if (roles.some((r) => r.name === SUPER_ADMIN_ROLE)) {
      assertCanGrant(actor, ['admin.view'], 'assign platform roles with');
    }
    assertCanGrant(actor, roles.flatMap((r) => rolePermissionKeys(r)), 'assign roles with');
    const current = await this.heldPermissionKeys(id);
    await this.assertCanAdminister(id, actor, 'change the roles of');

    const losesOwner = current.roleNames.includes(OWNER_ROLE) && !roles.some((r) => r.name === OWNER_ROLE);
    if (losesOwner && target.status === 'ACTIVE' && (await this.activeOwnerCount(actor.organizationId)) <= 1) {
      throw new ForbiddenException('The last Organization Owner cannot lose the Owner role');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.userRole.deleteMany({ where: { userId: id } });
      await tx.userRole.createMany({
        data: roles.map((role) => ({ userId: id, roleId: role.id, organizationId: actor.organizationId, branchId: target.branchId })),
      });
    });
    await this.audit.log({
      organizationId: actor.organizationId,
      userId: actor.id,
      action: 'SET_ROLES',
      resource: 'user',
      resourceId: id,
      beforeData: { roles: current.roleNames },
      afterData: { roles: roles.map((r) => r.name) },
    });
    return this.findManaged(id, actor);
  }

  /** Moves a user to another branch of the organization (org-wide actors only). */
  async moveBranch(id: string, branchId: string, actor: Actor) {
    if (!actor.orgWide) throw new ForbiddenException('Only organization-wide administrators can move staff between branches');
    assertUuid(branchId, 'branchId');
    const target = await this.findManaged(id, actor);
    await this.assertCanAdminister(id, actor, 'move');
    const branch = await this.prisma.branch.findFirst({
      where: { id: branchId, organizationId: actor.organizationId, status: 'ACTIVE' },
      select: { id: true, name: true },
    });
    if (!branch) throw new NotFoundException('Branch not found');
    if (target.branchId === branch.id) return target;
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id }, data: { branchId: branch.id, updatedBy: actor.id } }),
      this.prisma.userRole.updateMany({ where: { userId: id }, data: { branchId: branch.id } }),
    ]);
    await this.audit.log({
      organizationId: actor.organizationId,
      userId: actor.id,
      action: 'MOVE_BRANCH',
      resource: 'user',
      resourceId: id,
      beforeData: { branchId: target.branchId },
      afterData: { branchId: branch.id },
    });
    return this.findManaged(id, actor);
  }
}
