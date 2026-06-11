import { PrismaClient, AppointmentStatus, ConsultationStatus, InvoiceStatus, PaymentStatus } from '@prisma/client';
import { faker } from '@faker-js/faker';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🚀 Starting High-Scale Load Test Seeding...');
  const start = Date.now();

  const passwordHash = await bcrypt.hash('password123', 10);

  // 1. Ensure Organization and Branch exist
  const org = await prisma.organization.upsert({
    where: { slug: 'load-test-org' },
    update: {},
    create: {
      name: 'Load Test Organization',
      slug: 'load-test-org',
      subscriptionPlan: 'ENTERPRISE',
      subscriptionStatus: 'ACTIVE',
    }
  });

  const branch = await prisma.branch.findFirst({ where: { organizationId: org.id } }) || await prisma.branch.create({
    data: { name: 'Main Branch', organizationId: org.id }
  });

  const doctor = await prisma.user.upsert({
    where: { organizationId_email: { organizationId: org.id, email: 'test-doctor@clinicplus.com' } },
    update: {},
    create: {
      email: 'test-doctor@clinicplus.com',
      passwordHash,
      firstName: 'Load',
      lastName: 'Doctor',
      organizationId: org.id,
      branchId: branch.id,
    }
  });

  // Helper for batching
  async function batchInsert(name: string, total: number, batchSize: number, creator: (index: number) => any, model: any) {
    console.log(`📥 Seeding ${total} ${name}...`);
    for (let i = 0; i < total; i += batchSize) {
      const currentBatchSize = Math.min(batchSize, total - i);
      const data = Array.from({ length: currentBatchSize }).map((_, idx) => creator(i + idx));
      await model.createMany({ data });
      console.log(`   - ${name}: ${i + currentBatchSize}/${total}`);
    }
  }

  // 2. Patients (10,000)
  await batchInsert('Patients', 10000, 1000, (i) => ({
    organizationId: org.id,
    branchId: branch.id,
    patientCode: `LT-PT-${i.toString().padStart(6, '0')}`,
    firstName: faker.person.firstName(),
    lastName: faker.person.lastName(),
    email: faker.internet.email(),
    phone: faker.phone.number(),
    gender: faker.helpers.arrayElement(['Male', 'Female']),
    dateOfBirth: faker.date.birthdate({ min: 18, max: 80, mode: 'age' }),
    status: 'ACTIVE'
  }), prisma.patient);

  const patients = await prisma.patient.findMany({
    where: { organizationId: org.id },
    select: { id: true }
  });

  // 3. Appointments (50,000)
  await batchInsert('Appointments', 50000, 5000, (i) => {
    const patient = patients[i % patients.length];
    const scheduledStart = faker.date.between({ from: '2025-01-01', to: '2026-12-31' });
    return {
      organizationId: org.id,
      branchId: branch.id,
      patientId: patient.id,
      doctorId: doctor.id,
      scheduledStart,
      scheduledEnd: new Date(scheduledStart.getTime() + 30 * 60000),
      status: 'COMPLETED' as AppointmentStatus,
    };
  }, prisma.appointment);

  const appointments = await prisma.appointment.findMany({
    where: { organizationId: org.id, status: 'COMPLETED' },
    select: { id: true, patientId: true, scheduledStart: true },
    take: 20000
  });

  // 4. Consultations (20,000)
  await batchInsert('Consultations', 20000, 2000, (i) => {
    const appt = appointments[i];
    return {
      organizationId: org.id,
      branchId: branch.id,
      patientId: appt.patientId,
      doctorId: doctor.id,
      appointmentId: appt.id,
      chiefComplaint: faker.lorem.sentence(),
      clinicalAssessment: faker.lorem.paragraph(),
      treatmentPlan: faker.lorem.paragraph(),
      consultationDate: appt.scheduledStart,
      status: 'COMPLETED' as ConsultationStatus,
    };
  }, prisma.consultation);

  const consultations = await prisma.consultation.findMany({
    where: { organizationId: org.id },
    select: { id: true, patientId: true },
    take: 20000
  });

  // 5. Prescriptions (20,000)
  await batchInsert('Prescriptions', 20000, 2000, (i) => {
    const cons = consultations[i];
    return {
      organizationId: org.id,
      branchId: branch.id,
      patientId: cons.patientId,
      doctorId: doctor.id,
      consultationId: cons.id,
    };
  }, prisma.prescription);

  // 6. Invoices (20,000)
  await batchInsert('Invoices', 20000, 2000, (i) => {
    const cons = consultations[i];
    const amount = faker.number.int({ min: 100, max: 1000 });
    return {
      organizationId: org.id,
      branchId: branch.id,
      patientId: cons.patientId,
      invoiceNumber: `LT-INV-${i.toString().padStart(6, '0')}`,
      subtotal: amount,
      total: amount,
      status: 'PAID' as InvoiceStatus,
    };
  }, prisma.invoice);

  const end = Date.now();
  console.log(`\n🌟 High-Scale Seeding Complete in ${((end - start) / 1000).toFixed(2)}s`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
