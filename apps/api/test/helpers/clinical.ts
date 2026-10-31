import { INestApplication } from '@nestjs/common';
import { hash } from 'bcryptjs';
import { PrismaService } from '../../src/prisma/prisma.service';
import { login, Tenant, TenantUser, TEST_PASSWORD, uniq } from './app';

/** Adds a second user with the given built-in role to a tenant and logs them in. */
export async function addRoleUser(app: INestApplication, prisma: PrismaService, t: Tenant, roleName: string): Promise<TenantUser> {
  const role = await prisma.role.findFirstOrThrow({ where: { organizationId: t.org.id, name: roleName } });
  const email = `${uniq(roleName.toLowerCase().replace(/\s+/g, '.'))}@example.test`;
  const user = await prisma.user.create({
    data: {
      organizationId: t.org.id,
      branchId: t.branch.id,
      email,
      passwordHash: await hash(TEST_PASSWORD, 4),
      firstName: 'Second',
      lastName: roleName,
    },
  });
  await prisma.userRole.create({ data: { organizationId: t.org.id, branchId: t.branch.id, userId: user.id, roleId: role.id } });
  const s = await login(app, email);
  return { id: user.id, email, role: roleName as any, token: s.accessToken, sessionId: s.sessionId, refreshToken: s.refreshToken };
}

