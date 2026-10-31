import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { PortalPatientContext } from './portal.constants';

/** Injects the authenticated patient context set by PortalAuthGuard. */
export const PortalPatient = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): PortalPatientContext => {
    const req = ctx.switchToHttp().getRequest();
    return req.portalPatient as PortalPatientContext;
  },
);
