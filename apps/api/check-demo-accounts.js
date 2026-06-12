const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  try {
    const demoUsers = await prisma.user.findMany({
      where: {
        email: {
          in: [
            'doctor.demo@clinicos.com',
            'receptionist.demo@clinicos.com',
            'owner.demo@clinicos.com'
          ]
        }
      }
    });
    console.log('Demo accounts found:', demoUsers.length);
    for (let i = 0; i < demoUsers.length; i++) {
      const u = demoUsers[i];
      console.log('  - ' + u.email + ' (' + u.firstName + ' ' + u.lastName + ')');
    }
  } catch (e) {
    console.error(e);
  } finally {
    await prisma.$disconnect();
  }
}
main();