import { Injectable, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { UsersService } from '../../users/users.service';
import { PrismaService } from '../../prisma/prisma.service';
import { extractPermissionNames, extractRoleNames, normalizeRoleName } from '../access.utils';
import { ORG_WIDE_ROLE_NAMES } from '../default-access';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ORG_WIDE = new Set(ORG_WIDE_ROLE_NAMES.map(normalizeRoleName));

export interface AuthenticatedUser {
  id: string;
  email: string;
  roles: string[];
  permissions: string[];
  organizationId: string;
  /** Active branch for this request: the home branch, or X-Branch-Id for org-wide users. */
  branchId: string;
  /** The user's own branch, regardless of any branch switch. */
  homeBranchId: string;
  /** True for Owner / Clinic Admin / Super Admin: may read and switch across branches. */
  orgWide: boolean;
  firstName: string;
  lastName: string;
  sessionId?: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private usersService: UsersService,
    private prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      // JWT_SECRET is validated at startup (src/config/env.validation.ts); no fallback.
      secretOrKey: configService.getOrThrow<string>('JWT_SECRET'),
      passReqToCallback: true,
    });
  }

  /**
   * Roles, permissions and tenant are ALWAYS re-derived from the database so
   * that role changes / deactivation take effect immediately and a token can
   * never carry elevated claims.
   *
   * Branch scoping: every service filters by `user.branchId`. Branch-level staff
   * are pinned to their home branch; org-wide roles may target another branch of
   * the SAME organization with the `X-Branch-Id` header.
   */
  async validate(req: Request, payload: { sub: string; sid?: string }): Promise<AuthenticatedUser> {
    if (!payload?.sub) {
      throw new UnauthorizedException();
    }
    const user = await this.usersService.findActiveById(payload.sub);
    if (!user) {
      throw new UnauthorizedException();
    }
    const roles = extractRoleNames(user.roles);
    const orgWide = roles.some((r) => ORG_WIDE.has(normalizeRoleName(r)));

    let branchId = user.branchId;
    const requested = req.headers['x-branch-id'];
    const requestedBranch = Array.isArray(requested) ? requested[0] : requested;
    if (requestedBranch && requestedBranch !== user.branchId) {
      if (!orgWide) {
        throw new ForbiddenException('You do not have access to other branches');
      }
      const branch = UUID_RE.test(requestedBranch)
        ? await this.prisma.branch.findFirst({
            where: { id: requestedBranch, organizationId: user.organizationId, status: 'ACTIVE' },
            select: { id: true },
          })
        : null;
      if (!branch) {
        throw new ForbiddenException('Unknown branch');
      }
      branchId = branch.id;
    }

    return {
      id: user.id,
      email: user.email,
      roles,
      permissions: extractPermissionNames(user.roles),
      organizationId: user.organizationId,
      branchId,
      homeBranchId: user.branchId,
      orgWide,
      firstName: user.firstName,
      lastName: user.lastName,
      sessionId: payload.sid,
    };
  }
}
