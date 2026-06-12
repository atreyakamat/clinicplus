const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  try {
    const patients = await prisma.patient.count();
    const appointments = await prisma.appointment.count();
    const consultations = await prisma.consultation.count();
    const invoices = await prisma.invoice.count();
    const payments = await prisma.payment.count();
    console.log('Patients:', patients);
    console.log('Appointments:', appointments);
    console.log('Consultations:', consultations);
    console.log('Invoices:', invoices);
    console.log('Payments:', payments);
  } catch (e) {
    console.error(e);
  } finally {
    await prisma.$disconnect();
  }
}
main();
