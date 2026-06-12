const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  try {
    const orgs = await prisma.organization.findMany();
    const branches = await prisma.branch.findMany();
    const users = await prisma.user.findMany();
    console.log('Organizations:', orgs.length);
    console.log('Branches:', branches.length);
    console.log('Users:', users.length);

    if (users.length > 0) {
      console.log('Sample users:');
      for (let i = 0; i < Math.min(3, users.length); i++) {
        const u = users[i];
        console.log('  - ' + u.email + ': ' + u.firstName + ' ' + u.lastName + ' (Org: ' + u.organizationId + ', Branch: ' + u.branchId + ')');
      }
    }
  } catch (e) {
    console.error(e);
  } finally {
    await prisma.$disconnect();
  }
}
main();