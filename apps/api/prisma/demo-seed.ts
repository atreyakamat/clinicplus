import { PrismaClient } from '@prisma/client';
import { faker } from '@faker-js/faker';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🚀 Starting ClinicOS Demo Data Seeding...');
  console.log('📊 Generating: 100 Patients, 200 Appointments, 50 Consultations, 50 Prescriptions, 50 Invoices, 50 Payments, 20 Follow-Ups');

  const passwordHash = await bcrypt.hash('DemoPass123!', 10);

  // Get existing organizations and branches (assuming they exist from main seed)
  const orgs = await prisma.organization.findMany();
  const branches = await prisma.branch.findMany();

  if (orgs.length === 0 || branches.length === 0) {
    console.error('❌ No organizations or branches found. Please run main seed first.');
    process.exit(1);
  }

  console.log(`🏢 Found ${orgs.length} organizations and ${branches.length} branches`);

  // Get or create demo users (doctor, receptionist, clinic owner)
  let demoDoctor: any, demoReceptionist: any, demoOwner: any;

  // Try to find existing users, or create them
  const existingUsers = await prisma.user.findMany({
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

  if (existingUsers.length >= 3) {
    // Use existing demo users
    [demoDoctor, demoReceptionist, demoOwner] = existingUsers.filter(u =>
      ['doctor.demo@clinicos.com', 'receptionist.demo@clinicos.com', 'owner.demo@clinicos.com'].includes(u.email)
    );
    console.log('👥 Using existing demo accounts');
  } else {
    // Create demo users
    console.log('👥 Creating demo accounts...');

    // Find a branch to associate users with
    const sampleBranch = branches[0];

    demoDoctor = await prisma.user.create({
      data: {
        email: 'doctor.demo@clinicos.com',
        passwordHash,
        firstName: 'Demo',
        lastName: 'Doctor',
        organizationId: sampleBranch.organizationId,
        branchId: sampleBranch.id,
      }
    });

    demoReceptionist = await prisma.user.create({
      data: {
        email: 'receptionist.demo@clinicos.com',
        passwordHash,
        firstName: 'Demo',
        lastName: 'Receptionist',
        organizationId: sampleBranch.organizationId,
        branchId: sampleBranch.id,
      }
    });

    demoOwner = await prisma.user.create({
      data: {
        email: 'owner.demo@clinicos.com',
        passwordHash,
        firstName: 'Demo',
        lastName: 'Owner',
        organizationId: sampleBranch.organizationId,
        branchId: sampleBranch.id,
      }
    });

    console.log('✅ Demo accounts created');
  }

  // --- PHASE 1: 100 Patients ---
  console.log('📥 Seeding 100 Patients...');
  const patients: any[] = [];
  for (let i = 0; i < 100; i++) {
    const branch = faker.helpers.arrayElement(branches);
    patients.push({
      organizationId: branch.organizationId,
      branchId: branch.id,
      patientCode: `PT-${String(10000 + i).padEnd(8, '0').slice(0, 8).toUpperCase()}`,
      firstName: faker.person.firstName(),
      lastName: faker.person.lastName(),
      email: `patient${i+100}@demo.com`,
      phone: faker.phone.number(),
      gender: faker.helpers.arrayElement(['Male', 'Female', 'Other']),
      dateOfBirth: faker.date.birthdate({ min: 0, max: 90, mode: 'age' }),
      bloodGroup: faker.helpers.arrayElement(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']),
      createdBy: demoDoctor.id,
    });
  }

  await prisma.patient.createMany({ data: patients });
  console.log(`   - Created ${patients.length} patients`);

  // --- PHASE 2: 200 Appointments ---
  console.log('📅 Seeding 200 Appointments...');
  const actualPatients = await prisma.patient.findMany({ take: 100 });

  const appointments: any[] = [];
  for (let i = 0; i < 200; i++) {
    const patient = faker.helpers.arrayElement(actualPatients);
    appointments.push({
      organizationId: patient.organizationId,
      branchId: patient.branchId,
      patientId: patient.id,
      doctorId: demoDoctor.id,
      scheduledStart: faker.date.between({ from: '2026-01-01', to: '2026-12-31' }),
      scheduledEnd: faker.date.soon({ days: 30 }),
      status: faker.helpers.arrayElement(['SCHEDULED', 'CONFIRMED', 'COMPLETED', 'CANCELLED']),
      createdBy: demoDoctor.id,
    });
  }

  await prisma.appointment.createMany({ data: appointments });
  console.log(`   - Created ${appointments.length} appointments`);

  // --- PHASE 3: 50 Consultations ---
  console.log('🩺 Seeding 50 Consultations...');
  let consultationsToCreate = await prisma.appointment.findMany({
    where: { status: 'COMPLETED' },
    take: 50
  });

  // If we don't have enough completed appointments, use scheduled ones and mark them completed
  if (consultationsToCreate.length < 50) {
    const needed = 50 - consultationsToCreate.length;
    const scheduledAppointments = await prisma.appointment.findMany({
      where: { status: { in: ['SCHEDULED', 'CONFIRMED'] } },
      take: needed
    });

    // Update scheduled appointments to completed
    for (const apt of scheduledAppointments) {
      await prisma.appointment.update({
        where: { id: apt.id },
        data: { status: 'COMPLETED' }
      });
      consultationsToCreate.push(apt);
    }
  }

  // Take exactly 50 for consultations
  consultationsToCreate = consultationsToCreate.slice(0, 50);

  const consultations: any[] = [];
  for (const appt of consultationsToCreate) {
    consultations.push({
      organizationId: appt.organizationId,
      branchId: appt.branchId,
      patientId: appt.patientId,
      doctorId: appt.doctorId,
      appointmentId: appt.id,
      chiefComplaint: faker.lorem.sentence(),
      clinicalAssessment: faker.lorem.paragraphs(2),
      treatmentPlan: faker.lorem.paragraph(),
      status: 'COMPLETED',
      consultationDate: appt.scheduledStart,
      vitals: {
        create: {
          organizationId: appt.organizationId,
          branchId: appt.branchId,
          weight: faker.number.float({ min: 40, max: 120 }),
          height: faker.number.float({ min: 140, max: 200 }),
          temperature: faker.number.float({ min: 36, max: 40 }),
          pulse: faker.number.int({ min: 60, max: 100 }),
          bloodPressureSystolic: faker.number.int({ min: 110, max: 140 }),
          bloodPressureDiastolic: faker.number.int({ min: 70, max: 90 }),
        }
      },
      diagnoses: {
        create: {
          organizationId: appt.organizationId,
          branchId: appt.branchId,
          diagnosisName: faker.helpers.arrayElement(['Hypertension', 'Type 2 Diabetes', 'Acute Pharyngitis', 'Lower Back Pain', 'Common Cold']),
          severity: 'MEDIUM'
        }
      }
    });
  }

  for (const consult of consultations) {
    await prisma.consultation.create({ data: consult });
  }
  console.log(`   - Created ${consultations.length} consultations`);

  // --- PHASE 4: 50 Prescriptions ---
  console.log('💊 Seeding 50 Prescriptions...');
  const prescriptionConsultations = await prisma.consultation.findMany({ take: 50 });

  for (const cons of prescriptionConsultations) {
    await prisma.prescription.create({
      data: {
        organizationId: cons.organizationId,
        branchId: cons.branchId,
        patientId: cons.patientId,
        doctorId: cons.doctorId,
        consultationId: cons.id,
        items: {
          create: Array.from({ length: faker.number.int({ min: 1, max: 3 }) }).map(() => ({
            organizationId: cons.organizationId,
            branchId: cons.branchId,
            medicineName: faker.helpers.arrayElement(['Amoxicillin', 'Lisinopril', 'Metformin', 'Atorvastatin', 'Ibuprofen']),
            dosage: '1 tablet',
            frequency: '1-0-1',
            duration: '5 days',
            instructions: 'After food'
          }))
        }
      }
    });
  }
  console.log(`   - Created 50 prescriptions`);

  // --- PHASE 5: 50 Invoices and Payments ---
  console.log('🧾 Seeding 50 Invoices and Payments...');
  const invoiceConsultations = await prisma.consultation.findMany({ take: 50 });

  for (const cons of invoiceConsultations) {
    const subtotal = faker.number.int({ min: 50, max: 500 });
    await prisma.invoice.create({
      data: {
        organizationId: cons.organizationId,
        branchId: cons.branchId,
        patientId: cons.patientId,
        invoiceNumber: `INV-${String(20000 + cons.id).padEnd(8, '0').slice(0, 8).toUpperCase()}`,
        subtotal: subtotal,
        total: subtotal,
        status: 'PAID',
        items: {
          create: {
            organizationId: cons.organizationId,
            branchId: cons.branchId,
            itemName: 'Consultation Fee',
            quantity: 1,
            unitPrice: subtotal,
            amount: subtotal
          }
        },
        payments: {
          create: {
            organizationId: cons.organizationId,
            branchId: cons.branchId,
            amount: subtotal,
            paymentMethod: faker.helpers.arrayElement(['CASH', 'UPI', 'CARD']),
            paymentStatus: 'PAID'
          }
        }
      }
    });
  }
  console.log(`   - Created 50 invoices with payments`);

  // --- PHASE 6: 20 Follow-Ups ---
  console.log('🔄 Seeding 20 Follow-Ups...');
  const followUpPatients = await prisma.patient.findMany({ take: 20 });

  const followUps: any[] = [];
  for (const patient of followUpPatients) {
    followUps.push({
      organizationId: patient.organizationId,
      branchId: patient.branchId,
      patientId: patient.id,
      doctorId: demoDoctor.id,
      scheduledDate: faker.date.soon({ days: 30 }),
      status: 'PENDING'
    });
  }

  await prisma.followUp.createMany({ data: followUps });
  console.log(`   - Created ${followUps.length} follow-ups`);

  console.log('🌟 DEMO SEEDING COMPLETE!');
  console.log('🔑 Demo Accounts:');
  console.log('   Doctor: doctor.demo@clinicos.com / DemoPass123!');
  console.log('   Receptionist: receptionist.demo@clinicos.com / DemoPass123!');
  console.log('   Owner: owner.demo@clinicos.com / DemoPass123!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });