import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
  Logger,
  GoneException,
} from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { TenantAssertService } from '../common/tenant/tenant-assert.service';
import { MailService } from '../common/mail/mail.service';
import { AuditService } from '../common/services/audit.service';
import { AuthService, AuthContext } from '../auth/auth.service';
import { SmsService } from '../messages/sms.service';
import { Actor, SUPER_ADMIN_ROLE, assertCanGrant, rolePermissionKeys } from '../auth/access-policy';
import { InviteStaffDto, AcceptInvitationDto } from './dto/invitation.dto';

const INVITATION_DAYS = 7;
const TOKEN_RE = /^[0-9a-f]{64}$/i;
const NON_INVITABLE_ROLES = new Set([SUPER_ADMIN_ROLE, 'Patient']);

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

/** StaffInvitation.token holds sha256(rawToken); the raw token only exists in the invite link. */
function hashToken(raw: string) {
  return sha256(raw.toLowerCase());
}

@Injectable()
export class StaffInvitationsService {
  private readonly logger = new Logger(StaffInvitationsService.name);

  constructor(
    private prisma: PrismaService,
    private tenant: TenantAssertService,
    private mail: MailService,
    private audit: AuditService,
    private auth: AuthService,
    private config: ConfigService,
    private moduleRef: ModuleRef,
  ) {}

  private inviteUrl(rawToken: string) {
    const base = (this.config.get<string>('APP_BASE_URL') ?? 'http://localhost:5173').replace(/\/+$/, '');
    return `${base}/invite/${rawToken}`;
  }

  /** SmsService lives in the messaging module; resolve it lazily so this module stays decoupled. */
  private smsService(): SmsService | null {
    try {
      return this.moduleRef.get(SmsService, { strict: false });
    } catch {
      return null;
    }
  }

  private async findByRawToken(raw: string) {
    if (!TOKEN_RE.test(raw)) return null;
    const hashed = hashToken(raw);
    return (
      (await this.prisma.staffInvitation.findUnique({
        where: { token: hashed },
        include: { organization: { select: { id: true, name: true } } },
      })) ??
      (await this.prisma.staffInvitation.findUnique({
        where: { token: raw },
        include: { organization: { select: { id: true, name: true } } },
      }))
    );
  }

  async create(data: InviteStaffDto, actor: Actor) {
    const organizationId = actor.organizationId;
    const email = data.email.trim().toLowerCase();
    const existingUser = await this.prisma.user.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
      select: { id: true },
    });
    if (existingUser) throw new ConflictException('A user with this e-mail already exists');

    const role = await this.tenant.role(data.roleId, organizationId);
    if (NON_INVITABLE_ROLES.has(role.name)) throw new BadRequestException('This role cannot be assigned by invitation');
    const roleWithPerms = await this.prisma.role.findFirst({
      where: { id: role.id },
      include: { rolePermissions: { include: { permission: true } } },
    });
    assertCanGrant(actor, rolePermissionKeys(roleWithPerms ?? {}), 'invite staff into a role with');

    const targetBranchId = data.branchId ?? actor.branchId;
    if (!actor.orgWide && targetBranchId !== (actor.homeBranchId ?? actor.branchId)) {
      throw new ForbiddenException('You can only invite staff to your own branch');
    }
    const branch = await this.tenant.branch(targetBranchId, organizationId);

    const pending = await this.prisma.staffInvitation.findFirst({
      where: { organizationId, email, status: 'PENDING', expiresAt: { gt: new Date() } },
    });
    if (pending) throw new ConflictException('An invitation for this e-mail is already pending; revoke it to send a new one');

    const rawToken = randomBytes(32).toString('hex');
    const invitation = await this.prisma.staffInvitation.create({
      data: {
        email,
        phone: data.phone || null,
        roleId: role.id,
        organizationId,
        token: hashToken(rawToken),
        branchId: branch.id,
        expiresAt: new Date(Date.now() + INVITATION_DAYS * 86_400_000),
      },
      include: { organization: { select: { name: true } } },
    });

    const link = this.inviteUrl(rawToken);
    const orgName = invitation.organization.name;
    const emailResult = await this.mail.send({
      to: email,
      subject: `You have been invited to join ${orgName} on ClinicPlus`,
      text: `Hello,\n\nYou have been invited to join ${orgName} (${branch.name}) on ClinicPlus as ${role.name}.\n\nOpen this link within ${INVITATION_DAYS} days to set your password and activate your account:\n\n${link}\n`,
    });

    let smsDelivered = false;
    let smsError: string | undefined;
    if (invitation.phone) {
      const sms = this.smsService();
      if (!sms) {
        smsError = 'SMS service unavailable';
      } else {
        try {
          const res = await sms.sendSms(
            invitation.phone,
            `${orgName} invited you to ClinicPlus as ${role.name}. Activate your account: ${link}`,
            organizationId,
            branch.id,
          );
          smsDelivered = !!res?.success;
          smsError = res?.success ? undefined : res?.error ?? 'SMS not delivered';
        } catch (err: any) {
          smsError = err?.message ?? 'SMS failed';
          this.logger.warn(`Invitation SMS failed for ${invitation.id}: ${smsError}`);
        }
      }
    }

    await this.audit.log({
      organizationId,
      userId: actor.id,
      action: 'INVITE',
      resource: 'staff_invitation',
      resourceId: invitation.id,
      afterData: { email, roleId: role.id, role: role.name, branchId: branch.id, emailDelivered: emailResult.delivered, smsDelivered },
    });

    const delivered = emailResult.delivered || smsDelivered;
    return {
      id: invitation.id,
      email: invitation.email,
      phone: invitation.phone,
      roleId: invitation.roleId,
      roleName: role.name,
      branchId: branch.id,
      branchName: branch.name,
      status: invitation.status,
      expiresAt: invitation.expiresAt,
      emailDelivered: emailResult.delivered,
      emailError: emailResult.delivered ? undefined : emailResult.error,
      smsDelivered,
      smsError,
      // When no channel delivered the invite, the inviting admin gets the link to hand over personally.
      inviteUrl: delivered ? undefined : link,
    };
  }

  async findAll(actor: Actor) {
    const rows = await this.prisma.staffInvitation.findMany({
      where: { organizationId: actor.organizationId },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
    const roleIds = Array.from(new Set(rows.map((r) => r.roleId)));
    const roles = await this.prisma.role.findMany({
      where: { id: { in: roleIds }, organizationId: actor.organizationId },
      select: { id: true, name: true },
    });
    const branches = await this.prisma.branch.findMany({
      where: { organizationId: actor.organizationId },
      select: { id: true, name: true },
    });
    const roleName = new Map(roles.map((r) => [r.id, r.name]));
    const branchName = new Map(branches.map((b) => [b.id, b.name]));
    const now = new Date();
    const homeBranch = actor.homeBranchId ?? actor.branchId;
    return rows
      .map((r) => {
        const branchId = r.branchId;
        return {
          id: r.id,
          email: r.email,
          phone: r.phone,
          roleId: r.roleId,
          roleName: roleName.get(r.roleId) ?? null,
          branchId,
          branchName: branchId ? branchName.get(branchId) ?? null : null,
          status: r.status === 'PENDING' && r.expiresAt < now ? 'EXPIRED' : r.status,
          expiresAt: r.expiresAt,
          createdAt: r.createdAt,
        };
      })
      .filter((r) => actor.orgWide || r.branchId === homeBranch);
  }

  async revoke(id: string, actor: Actor) {
    const inv = await this.prisma.staffInvitation.findFirst({ where: { id, organizationId: actor.organizationId } });
    if (!inv) throw new NotFoundException('Invitation not found');
    if (!actor.orgWide && inv.branchId !== (actor.homeBranchId ?? actor.branchId)) {
      throw new NotFoundException('Invitation not found');
    }
    if (inv.status !== 'PENDING') throw new ConflictException('Invitation is no longer pending');
    await this.prisma.staffInvitation.update({ where: { id }, data: { status: 'REVOKED' } });
    await this.audit.log({ organizationId: actor.organizationId, userId: actor.id, action: 'REVOKE', resource: 'staff_invitation', resourceId: id });
    return { message: 'Invitation revoked' };
  }

  /** Public preview for the accept page; exposes only what the invitee needs. */
  async findByToken(token: string) {
    const invitation = await this.findByRawToken(token);
    if (!invitation || invitation.status !== 'PENDING') throw new NotFoundException('Invitation not found');
    if (invitation.expiresAt < new Date()) throw new GoneException('Invitation has expired');
    const role = await this.prisma.role.findFirst({
      where: { id: invitation.roleId, organizationId: invitation.organizationId },
      select: { name: true },
    });
    const branchId = invitation.branchId;
    const branch = branchId
      ? await this.prisma.branch.findFirst({ where: { id: branchId, organizationId: invitation.organizationId }, select: { name: true } })
      : null;
    return {
      email: invitation.email,
      organizationName: invitation.organization.name,
      roleName: role?.name ?? null,
      branchName: branch?.name ?? null,
      expiresAt: invitation.expiresAt,
    };
  }

  /** Creates the account with the invited role and branch, then signs the new user in. */
  async accept(token: string, userData: AcceptInvitationDto, ctx: AuthContext = {}) {
    const invitation = await this.findByRawToken(token);
    if (!invitation || invitation.status !== 'PENDING') throw new NotFoundException('Invitation not found');
    if (invitation.expiresAt < new Date()) throw new GoneException('Invitation has expired');

    const duplicate = await this.prisma.user.findFirst({
      where: { email: { equals: invitation.email, mode: 'insensitive' } },
      select: { id: true },
    });
    if (duplicate) throw new ConflictException('A user with this e-mail already exists');

    const role = await this.prisma.role.findFirst({
      where: { id: invitation.roleId, organizationId: invitation.organizationId, deletedAt: null },
    });
    if (!role) throw new ConflictException('The invited role no longer exists; ask your administrator for a new invitation');

    const passwordHash = await AuthService.hashPassword(userData.password);
    const wantedBranchId = invitation.branchId;
    const user = await this.prisma.$transaction(async (tx) => {
      // Claim the invitation first so two concurrent accepts cannot both succeed.
      const claimed = await tx.staffInvitation.updateMany({
        where: { id: invitation.id, status: 'PENDING' },
        data: { status: 'ACCEPTED' },
      });
      if (claimed.count !== 1) throw new ConflictException('Invitation has already been used');

      const branch =
        (wantedBranchId
          ? await tx.branch.findFirst({ where: { id: wantedBranchId, organizationId: invitation.organizationId, status: 'ACTIVE' } })
          : null) ??
        (await tx.branch.findFirst({
          where: { organizationId: invitation.organizationId, status: 'ACTIVE' },
          orderBy: { createdAt: 'asc' },
        }));
      if (!branch) throw new BadRequestException('Organization has no active branch');
      const created = await tx.user.create({
        data: {
          organizationId: invitation.organizationId,
          branchId: branch.id,
          email: invitation.email,
          phone: userData.phone || invitation.phone,
          firstName: userData.firstName,
          lastName: userData.lastName,
          passwordHash,
        },
      });
      await tx.userRole.create({
        data: { organizationId: invitation.organizationId, branchId: branch.id, userId: created.id, roleId: role.id },
      });
      return created;
    });

    await this.audit.log({
      organizationId: invitation.organizationId,
      userId: user.id,
      action: 'ACCEPT_INVITATION',
      resource: 'user',
      resourceId: user.id,
      afterData: { invitationId: invitation.id, role: role.name, branchId: user.branchId },
    });

    return this.auth.login({ email: user.email, password: userData.password }, ctx);
  }
}
