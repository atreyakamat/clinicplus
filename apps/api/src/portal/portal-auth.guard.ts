import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { PORTAL_TOKEN_TYPE, PortalTokenClaims } from './portal.constants';

/**
 * Authenticates a patient portal request.
 *
 * Accepts ONLY patient access tokens (`typ: 'patient'`) and re-derives the live
 * session + patient from the database on every request, so that:
 *  - staff tokens (which carry no `typ: 'patient'`) are rejected;
 *  - a revoked / expired session, a disabled portal account or an archived
 *    patient immediately stops working even while the short-lived access token
 *    is still cryptographically valid.
 *
 * On success it sets `req.portalPatient` = { patientId, organizationId, branchId,
 * sessionId }. It never sets `req.user`, so the global staff interceptors and
 * guards treat portal routes as unauthenticated and skip them.
 */
@Injectable()
export class PortalAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request & { portalPatient?: unknown }>();
    const header = req.headers['authorization'];
    const raw = Array.isArray(header) ? header[0] : header;
    if (!raw || !raw.startsWith('Bearer ')) {
      throw new UnauthorizedException('Patient authentication required');
    }
    const token = raw.slice(7).trim();

    let claims: PortalTokenClaims;
    try {
      claims = await this.jwt.verifyAsync<PortalTokenClaims>(token, {
        secret: this.config.getOrThrow<string>('JWT_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired session');
    }

    // Reject anything that is not a patient token (e.g. a staff access token).
    if (!claims || claims.typ !== PORTAL_TOKEN_TYPE || !claims.patientId || !claims.organizationId || !claims.sid) {
      throw new UnauthorizedException('Invalid or expired session');
    }

    const session = await this.prisma.patientPortalSession.findFirst({
      where: {
        id: claims.sid,
        patientId: claims.patientId,
        organizationId: claims.organizationId,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      select: {
        id: true,
        organizationId: true,
        patient: { select: { id: true, branchId: true, organizationId: true, portalEnabled: true, status: true } },
      },
    });

    if (
      !session ||
      !session.patient ||
      !session.patient.portalEnabled ||
      session.patient.status !== 'ACTIVE' ||
      session.patient.organizationId !== claims.organizationId
    ) {
      throw new UnauthorizedException('Invalid or expired session');
    }

    (req as any).portalPatient = {
      patientId: session.patient.id,
      organizationId: session.organizationId,
      branchId: session.patient.branchId,
      sessionId: session.id,
    };
    return true;
  }
}
