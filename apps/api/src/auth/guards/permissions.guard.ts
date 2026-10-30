import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';
import { normalizePermission } from '../access.utils';

/**
 * Permission check. Permissions are always derived from the database by
 * JwtStrategy (never from the token payload) and there is NO wildcard: a user
 * holds a permission only if one of their roles grants it.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }
    const { user } = context.switchToHttp().getRequest();
    if (!user || !Array.isArray(user.permissions)) {
      return false;
    }
    const granted = new Set(
      (user.permissions as string[]).map(normalizePermission),
    );
    return requiredPermissions
      .map(normalizePermission)
      .every((permission) => granted.has(permission));
  }
}
