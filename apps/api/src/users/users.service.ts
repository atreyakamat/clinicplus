import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { normalizeRoleName } from '../auth/access.utils';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async findByEmail(email: string) {
    return this.prisma.user.findFirst({
      where: { email, status: 'ACTIVE' },
      include: {
        roles: {
          include: {
            role: {
              include: {
                rolePermissions: {
                  include: {
                    permission: true,
                  },
                },
              },
            },
          },
        },
      },
    });
  }

  async findAll(organizationId: string, branchId: string, role?: string) {
    const users = await this.prisma.user.findMany({
      where: {
        organizationId,
        branchId,
        status: 'ACTIVE',
      },
      include: {
        roles: {
          include: {
            role: true,
          },
        },
      },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    });

    if (!role) {
      return users;
    }

    const normalizedRole = normalizeRoleName(role);
    return users.filter((user) =>
      user.roles.some(
        (entry) => normalizeRoleName(entry.role.name) === normalizedRole,
      ),
    );
  }

  async findOne(id: string, organizationId: string, branchId: string) {
    return this.prisma.user.findFirst({
      where: {
        id,
        organizationId,
        branchId,
        status: 'ACTIVE',
      },
      include: {
        roles: {
          include: {
            role: true,
          },
        },
      },
    });
  }
}
