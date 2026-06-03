import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredRoles) {
      return true;
    }
    const { user } = context.switchToHttp().getRequest();
    if (!user) return false;
    
    // Support both user.roles as string array or user.roles as object array from Prisma
    const userRoles = user.roles?.map((r: any) => typeof r === 'string' ? r : r.role?.name || r.name) || [];
    
    return requiredRoles.some((role) => userRoles.includes(role));
  }
}
