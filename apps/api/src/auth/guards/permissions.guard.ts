import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';
import { normalizePermission } from '../access.utils';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!requiredPermissions) {
      return true;
    }
    const { user } = context.switchToHttp().getRequest();
    if (!user || !user.permissions) {
      return false;
    }
    const grantedPermissions = new Set(
      (user.permissions as string[]).map(normalizePermission),
    );

    if (grantedPermissions.has('*')) {
      return true;
    }

    return requiredPermissions
      .map(normalizePermission)
      .every((permission) => grantedPermissions.has(permission));
  }
}
