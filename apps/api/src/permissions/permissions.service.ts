import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { normalizePermission } from '../auth/access.utils';
import { isValidPermissionKey } from '../auth/access-policy';

@Injectable()
export class PermissionsService {
  constructor(private prisma: PrismaService) {}

  /** The organization's permission catalog (only keys known to the current build). */
  async findAll(organizationId: string) {
    const rows = await this.prisma.permission.findMany({
      where: { organizationId },
      select: { id: true, module: true, action: true, description: true },
      orderBy: [{ module: 'asc' }, { action: 'asc' }],
    });
    return rows
      .map((p) => ({ ...p, key: normalizePermission(`${p.module}.${p.action}`) }))
      .filter((p) => isValidPermissionKey(p.key));
  }
}
