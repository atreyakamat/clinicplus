/**
 * Production bootstrap: creates the platform operator account (Super Admin) used
 * for the Founder panel and support. Safe to run repeatedly; it never touches
 * clinic data. Clinics sign themselves up via the web app (/auth/login → Register).
 *
 *   SUPERADMIN_EMAIL=ops@yourcompany.com SUPERADMIN_PASSWORD='...' pnpm --filter api seed
 *
 * For a demo clinic with sample data use `pnpm --filter api seed:demo` instead.
 */
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { ensureOrganizationAccess } from '../src/auth/access.bootstrap';
import { isStrongPassword, PASSWORD_POLICY_MESSAGE } from '../src/common/validation/password';

const prisma = new PrismaClient();
const PLATFORM_SLUG = 'platform';

async function main() {
  const email = (process.env.SUPERADMIN_EMAIL || '').trim().toLowerCase();
  const password = process.env.SUPERADMIN_PASSWORD || '';
  if (!email || !password) {
    throw new Error('Set SUPERADMIN_EMAIL and SUPERADMIN_PASSWORD to bootstrap the platform operator account.');
  }
  if (!isStrongPassword(password)) {
    throw new Error(`SUPERADMIN_PASSWORD: ${PASSWORD_POLICY_MESSAGE}`);
  }

  const org = await prisma.organization.upsert({
    where: { slug: PLATFORM_SLUG },
    update: {},
    create: { name: 'ClinicPlus Platform', slug: PLATFORM_SLUG, subscriptionPlan: 'ENTERPRISE', subscriptionStatus: 'ACTIVE' },
  });
  const branch =
    (await prisma.branch.findFirst({ where: { organizationId: org.id } })) ??
    (await prisma.branch.create({ data: { organizationId: org.id, name: 'Operations' } }));
  const { rolesByName } = await ensureOrganizationAccess(prisma, org.id, null);
  const superAdminRole = rolesByName.get('Super Admin');
  if (!superAdminRole) throw new Error('Super Admin role missing from the role matrix');

  const existing = await prisma.user.findFirst({ where: { organizationId: org.id, email } });
  const passwordHash = await bcrypt.hash(password, 12);
  const user = existing
    ? await prisma.user.update({ where: { id: existing.id }, data: { passwordHash, status: 'ACTIVE' } })
    : await prisma.user.create({
        data: { organizationId: org.id, branchId: branch.id, email, passwordHash, firstName: 'Platform', lastName: 'Admin' },
      });
  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: user.id, roleId: superAdminRole.id } },
    update: {},
    create: { organizationId: org.id, branchId: branch.id, userId: user.id, roleId: superAdminRole.id },
  });
  console.log(`Platform operator ${existing ? 'updated' : 'created'}: ${email}`);
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
