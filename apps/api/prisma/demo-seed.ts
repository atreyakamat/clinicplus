/**
 * Demo tenant for sales demos and local QA.
 *
 *   pnpm --filter api seed:demo
 *
 * Creates (or rebuilds) "Sunrise Family Clinic" with two branches, one login per
 * built-in role, doctors with weekly availability, a service catalog, and a few
 * months of realistic activity (appointments, consultations, prescriptions,
 * invoices/payments, follow-ups, reviews, referrals, tasks).
 *
 * Safety: refuses to run against a non-local database unless ALLOW_SEED=true,
 * and only ever deletes data belonging to the demo organization slug.
 */
import { Prisma, PrismaClient } from '@prisma/client';
import { faker } from '@faker-js/faker';
import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { ensureOrganizationAccess } from '../src/auth/access.bootstrap';

const prisma = new PrismaClient();

const DEMO_SLUG = 'sunrise-demo';
const EMAIL_DOMAIN = 'sunrise.demo';
const PASSWORD = process.env.SEED_PASSWORD || 'Demo@Clinic2026';
const TZ_OFFSET_MIN = 330; // Asia/Kolkata, used to place appointments at local clinic hours

faker.seed(2026);

function assertSafeTarget() {
  const url = process.env.DATABASE_URL || '';
  const host = (/@([^:/?]+)/.exec(url)?.[1] ?? '').toLowerCase();
  const local = ['localhost', '127.0.0.1', 'db', 'postgres', 'host.docker.internal'].includes(host);
  if (!local && !['1', 'true', 'yes'].includes((process.env.ALLOW_SEED || '').toLowerCase())) {
    throw new Error(`Refusing to seed demo data into non-local database host "${host}". Set ALLOW_SEED=true to override.`);
  }
}

/** A Date at local clinic time (IST) `daysFromToday` days away. */
function at(daysFromToday: number, hour: number, minute = 0) {
  const now = new Date();
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + daysFromToday, hour, minute));
  return new Date(d.getTime() - TZ_OFFSET_MIN * 60_000);
}

const dec = (n: number) => new Prisma.Decimal(n.toFixed(2));
const pick = <T>(xs: readonly T[]) => xs[Math.floor(faker.number.float({ min: 0, max: 0.9999 }) * xs.length)];

/** Deletes everything owned by the demo org (children first). */
async function wipeDemoOrg(orgId: string) {
  const byOrg = { where: { organizationId: orgId } };
  const tx = prisma;
  await tx.taskComment.deleteMany(byOrg);
  await tx.task.deleteMany(byOrg);
  await tx.workflowTemplate.deleteMany(byOrg);
  await tx.reviewRequest.deleteMany(byOrg);
  await tx.review.deleteMany(byOrg);
  await tx.referral.deleteMany(byOrg);
  await tx.message.deleteMany(byOrg);
  await tx.campaign.deleteMany(byOrg);
  await tx.template.deleteMany(byOrg);
  await tx.webhookEvent.deleteMany(byOrg);
  await tx.refund.deleteMany(byOrg);
  await tx.payment.deleteMany(byOrg);
  await tx.invoiceItem.deleteMany(byOrg);
  await tx.invoice.deleteMany(byOrg);
  await tx.followUpOutcome.deleteMany(byOrg);
  await tx.followUp.deleteMany(byOrg);
  await tx.labReport.deleteMany(byOrg);
  await tx.imagingReport.deleteMany(byOrg);
  await tx.medicalDocument.deleteMany(byOrg);
  await tx.prescriptionItem.deleteMany(byOrg);
  await tx.prescription.deleteMany(byOrg);
  await tx.diagnosis.deleteMany(byOrg);
  await tx.vital.deleteMany(byOrg);
  await tx.consultation.deleteMany(byOrg);
  await tx.queueEntry.deleteMany(byOrg);
  await tx.queue.deleteMany(byOrg);
  await tx.waitingList.deleteMany(byOrg);
  await tx.appointmentSlot.deleteMany(byOrg);
  await tx.appointment.deleteMany(byOrg);
  await tx.doctorLeave.deleteMany(byOrg);
  await tx.doctorAvailability.deleteMany(byOrg);
  await tx.allergy.deleteMany(byOrg);
  await tx.medicalCondition.deleteMany(byOrg);
  await tx.timelineEvent.deleteMany(byOrg);
  await tx.patientNote.deleteMany(byOrg);
  await tx.patientTag.deleteMany(byOrg);
  await tx.patientAddress.deleteMany(byOrg);
  await tx.patientEmergencyContact.deleteMany(byOrg);
  await tx.patientFamilyMember.deleteMany(byOrg);
  await tx.patient.deleteMany(byOrg);
  await tx.feedback.deleteMany(byOrg);
  await tx.staffInvitation.deleteMany(byOrg);
  await tx.auditLog.deleteMany(byOrg);
  await tx.analyticsEvent.deleteMany(byOrg);
  await tx.dashboardSnapshot.deleteMany(byOrg);
  await tx.doctorMetric.deleteMany(byOrg);
  const users = await tx.user.findMany({ ...byOrg, select: { id: true } });
  const userIds = users.map((u) => u.id);
  await tx.userSession.deleteMany({ where: { userId: { in: userIds } } });
  await tx.passwordReset.deleteMany({ where: { userId: { in: userIds } } });
  await tx.userRole.deleteMany(byOrg);
  await tx.user.deleteMany(byOrg);
  await tx.rolePermission.deleteMany(byOrg);
  await tx.role.deleteMany(byOrg);
  await tx.permission.deleteMany(byOrg);
  await tx.clinicService.deleteMany(byOrg);
  await tx.workingHour.deleteMany(byOrg);
  await tx.clinicHoliday.deleteMany(byOrg);
  await tx.department.deleteMany(byOrg);
  await tx.branch.deleteMany(byOrg);
  await tx.organization.delete({ where: { id: orgId } });
}

const MEDS = [
  { name: 'Paracetamol 650mg', dosage: '1 tab', frequency: 'TDS', duration: '3 days' },
  { name: 'Amoxicillin 500mg', dosage: '1 cap', frequency: 'TDS', duration: '5 days' },
  { name: 'Cetirizine 10mg', dosage: '1 tab', frequency: 'HS', duration: '5 days' },
  { name: 'Pantoprazole 40mg', dosage: '1 tab', frequency: 'OD before breakfast', duration: '14 days' },
  { name: 'Metformin 500mg', dosage: '1 tab', frequency: 'BD', duration: '30 days' },
  { name: 'Amlodipine 5mg', dosage: '1 tab', frequency: 'OD', duration: '30 days' },
] as const;

const DIAGNOSES = [
  { code: 'J06.9', name: 'Acute upper respiratory infection' },
  { code: 'K21.9', name: 'Gastro-oesophageal reflux disease' },
  { code: 'E11.9', name: 'Type 2 diabetes mellitus' },
  { code: 'I10', name: 'Essential hypertension' },
  { code: 'J30.4', name: 'Allergic rhinitis' },
  { code: 'M54.5', name: 'Low back pain' },
] as const;

async function main() {
  assertSafeTarget();
  console.log('Seeding demo tenant "Sunrise Family Clinic"...');

  const existing = await prisma.organization.findUnique({ where: { slug: DEMO_SLUG } });
  if (existing) {
    console.log('  removing previous demo data');
    await wipeDemoOrg(existing.id);
  }

  const org = await prisma.organization.create({
    data: {
      name: 'Sunrise Family Clinic',
      legalName: 'Sunrise Healthcare Pvt Ltd',
      slug: DEMO_SLUG,
      email: `hello@${EMAIL_DOMAIN}`,
      phone: '+912000000000',
      subscriptionPlan: 'GROWTH',
      subscriptionStatus: 'ACTIVE',
      footerText: 'Sunrise Family Clinic · Caring for every generation',
    },
  });
  const main = await prisma.branch.create({
    data: { organizationId: org.id, name: 'Koregaon Park', code: 'KP', city: 'Pune', state: 'Maharashtra', country: 'India', timezone: 'Asia/Kolkata', phone: '+912000000001' },
  });
  const second = await prisma.branch.create({
    data: { organizationId: org.id, name: 'Baner', code: 'BN', city: 'Pune', state: 'Maharashtra', country: 'India', timezone: 'Asia/Kolkata', phone: '+912000000002' },
  });

  const { rolesByName } = await ensureOrganizationAccess(prisma, org.id, null);
  const passwordHash = await bcrypt.hash(PASSWORD, 10);

  async function staff(role: string, firstName: string, lastName: string, extra: Partial<Prisma.UserUncheckedCreateInput> = {}, branchId = main.id, extraRoles: string[] = []) {
    const email = `${role.toLowerCase().replace(/[^a-z]+/g, '.')}@${EMAIL_DOMAIN}`.replace('.@', '@');
    const user = await prisma.user.create({
      data: { organizationId: org.id, branchId, email, passwordHash, firstName, lastName, ...extra },
    });
    for (const r of [role, ...extraRoles]) {
      await prisma.userRole.create({ data: { organizationId: org.id, branchId, userId: user.id, roleId: rolesByName.get(r)!.id } });
    }
    return user;
  }

  const owner = await staff('Organization Owner', 'Meera', 'Kulkarni', {
    qualification: 'MBBS, MD (Medicine)', specialization: 'Internal Medicine', registrationNumber: 'MMC-104522', experienceYears: 18, consultationFee: 800,
  }, main.id, ['Doctor']);
  const admin = await staff('Clinic Admin', 'Rahul', 'Deshpande');
  const manager = await staff('Branch Manager', 'Sneha', 'Patil', {}, second.id);
  const doctor = await staff('Doctor', 'Arjun', 'Rao', {
    qualification: 'MBBS, DCH', specialization: 'Paediatrics', registrationNumber: 'MMC-118830', experienceYears: 9, consultationFee: 600,
  });
  const receptionist = await staff('Receptionist', 'Pooja', 'Shinde');
  const nurse = await staff('Nurse', 'Anita', 'Joseph');
  const accountant = await staff('Accountant', 'Vikram', 'Mehta');
  const doctors = [owner, doctor];

  // Clinic setup: hours, holidays, departments, services, availability.
  for (const branch of [main, second]) {
    for (let day = 1; day <= 6; day++) {
      await prisma.workingHour.create({
        data: { organizationId: org.id, branchId: branch.id, dayOfWeek: day, openTime: '09:00', closeTime: day === 6 ? '14:00' : '20:00', breakStart: day === 6 ? null : '13:30', breakEnd: day === 6 ? null : '14:30' },
      });
    }
  }
  const nextYear = new Date().getUTCFullYear() + 1;
  await prisma.clinicHoliday.createMany({
    data: [
      { organizationId: org.id, name: 'Republic Day', date: new Date(Date.UTC(nextYear, 0, 26)) },
      { organizationId: org.id, name: 'Independence Day', date: new Date(Date.UTC(nextYear, 7, 15)) },
    ],
  });
  const generalDept = await prisma.department.create({ data: { organizationId: org.id, branchId: main.id, name: 'General Medicine' } });
  const paedsDept = await prisma.department.create({ data: { organizationId: org.id, branchId: main.id, name: 'Paediatrics' } });
  const services = await Promise.all(
    [
      { name: 'General Consultation', duration: 15, price: 800, departmentId: generalDept.id },
      { name: 'Follow-up Consultation', duration: 10, price: 400, departmentId: generalDept.id },
      { name: 'Paediatric Consultation', duration: 20, price: 600, departmentId: paedsDept.id },
      { name: 'ECG', duration: 15, price: 350, departmentId: generalDept.id },
      { name: 'Nebulisation', duration: 15, price: 250, departmentId: paedsDept.id },
      { name: 'Dressing', duration: 10, price: 200, departmentId: generalDept.id },
    ].map((s) => prisma.clinicService.create({ data: { organizationId: org.id, ...s, price: dec(s.price) } })),
  );
  for (const d of doctors) {
    for (let day = 1; day <= 6; day++) {
      await prisma.doctorAvailability.create({
        data: { organizationId: org.id, branchId: main.id, doctorId: d.id, dayOfWeek: day, startTime: d.id === owner.id ? '10:00' : '16:00', endTime: d.id === owner.id ? '13:30' : '20:00', slotDuration: 15 },
      });
    }
  }
  await prisma.doctorLeave.create({
    data: { organizationId: org.id, branchId: main.id, doctorId: doctor.id, startDate: at(20, 0), endDate: at(22, 23, 59), reason: 'Conference', createdBy: admin.id },
  });

  // Patients
  const patients: { id: string; firstName: string; branchId: string }[] = [];
  for (let i = 0; i < 60; i++) {
    const sex = pick(['male', 'female'] as const);
    const firstName = faker.person.firstName(sex);
    const lastName = faker.person.lastName();
    const branchId = i % 5 === 0 ? second.id : main.id;
    const p = await prisma.patient.create({
      data: {
        organizationId: org.id,
        branchId,
        patientCode: `PAT-${String(i + 1).padStart(6, '0')}`,
        firstName,
        lastName,
        gender: sex.toUpperCase(),
        dateOfBirth: faker.date.birthdate({ min: 2, max: 80, mode: 'age' }),
        phone: `9${faker.string.numeric(9)}`,
        email: i % 3 === 0 ? faker.internet.email({ firstName, lastName, provider: 'example.com' }).toLowerCase() : null,
        bloodGroup: pick(['A+', 'B+', 'O+', 'AB+', 'O-', 'A-']),
        preferredChannel: i % 4 === 0 ? 'SMS' : 'WHATSAPP',
        createdBy: receptionist.id,
        createdAt: faker.date.past({ years: 1 }),
      },
    });
    patients.push({ id: p.id, firstName, branchId });
    await prisma.patientAddress.create({
      data: { organizationId: org.id, branchId, patientId: p.id, addressType: 'HOME', addressLine1: faker.location.streetAddress(), city: 'Pune', state: 'Maharashtra', country: 'India', postalCode: `4110${faker.string.numeric(2)}` },
    });
    if (i % 6 === 0) {
      await prisma.allergy.create({ data: { organizationId: org.id, branchId, patientId: p.id, allergyName: pick(['Penicillin', 'Sulfa drugs', 'Peanuts', 'Dust']), severity: pick(['MILD', 'MODERATE', 'SEVERE']) } });
    }
    if (i % 7 === 0) {
      await prisma.medicalCondition.create({ data: { organizationId: org.id, branchId, patientId: p.id, conditionName: pick(['Type 2 diabetes', 'Hypertension', 'Asthma']), status: 'ACTIVE' } });
    }
    if (i % 10 === 0) {
      await prisma.patientTag.create({ data: { organizationId: org.id, branchId, patientId: p.id, tagName: pick(['VIP', 'Chronic care', 'Senior citizen']), tagColor: '#1FA971' } });
    }
  }
  const mainPatients = patients.filter((p) => p.branchId === main.id);

  // Past visits (completed, with clinical records and billing) and upcoming bookings.
  let invoiceSeq = 0;
  const completedAppointments: { id: string; patientId: string; doctorId: string }[] = [];
  for (let i = 0; i < 90; i++) {
    const patient = pick(mainPatients);
    const d = pick(doctors);
    const daysAgo = -faker.number.int({ min: 1, max: 120 });
    const baseHour = d.id === owner.id ? 10 : 16;
    const start = at(daysAgo, baseHour + (i % 3), (i % 4) * 15);
    const end = new Date(start.getTime() + 15 * 60_000);
    const status = i % 11 === 0 ? 'NO_SHOW' : i % 13 === 0 ? 'CANCELLED' : 'COMPLETED';
    const appt = await prisma.appointment.create({
      data: { organizationId: org.id, branchId: main.id, patientId: patient.id, doctorId: d.id, appointmentType: 'CONSULTATION', appointmentSource: pick(['WALK_IN', 'PHONE', 'WHATSAPP']), scheduledStart: start, scheduledEnd: end, status, createdBy: receptionist.id, createdAt: new Date(start.getTime() - 2 * 86_400_000) },
    });
    if (status !== 'COMPLETED') continue;
    completedAppointments.push({ id: appt.id, patientId: patient.id, doctorId: d.id });

    const dx = pick(DIAGNOSES);
    const consult = await prisma.consultation.create({
      data: {
        organizationId: org.id, branchId: main.id, patientId: patient.id, doctorId: d.id, appointmentId: appt.id,
        chiefComplaint: dx.name.includes('respiratory') ? 'Fever and sore throat for 3 days' : 'Routine review',
        clinicalAssessment: dx.name, treatmentPlan: 'Medication as prescribed; review if symptoms persist.',
        consultationDate: start, status: 'COMPLETED', createdBy: d.id,
      },
    });
    await prisma.vital.create({
      data: { organizationId: org.id, branchId: main.id, consultationId: consult.id, height: faker.number.float({ min: 150, max: 185, fractionDigits: 0 }), weight: faker.number.float({ min: 45, max: 95, fractionDigits: 1 }), temperature: faker.number.float({ min: 36.5, max: 38.6, fractionDigits: 1 }), pulse: faker.number.int({ min: 64, max: 104 }), bloodPressureSystolic: faker.number.int({ min: 110, max: 150 }), bloodPressureDiastolic: faker.number.int({ min: 70, max: 95 }), spo2: faker.number.int({ min: 95, max: 99 }) },
    });
    await prisma.diagnosis.create({ data: { organizationId: org.id, branchId: main.id, consultationId: consult.id, icdCode: dx.code, diagnosisName: dx.name } });
    const meds = faker.helpers.arrayElements(MEDS as unknown as typeof MEDS[number][], { min: 1, max: 3 });
    await prisma.prescription.create({
      data: {
        organizationId: org.id, branchId: main.id, patientId: patient.id, doctorId: d.id, consultationId: consult.id, issuedAt: start,
        items: { create: meds.map((m) => ({ organizationId: org.id, branchId: main.id, medicineName: m.name, dosage: m.dosage, frequency: m.frequency, duration: m.duration })) },
      },
    });

    // Invoice: consultation fee (+ occasional procedure); most paid, some outstanding.
    const lines = [{ service: services[d.id === owner.id ? 0 : 2], qty: 1 }];
    if (i % 5 === 0) lines.push({ service: services[3], qty: 1 });
    const subtotal = lines.reduce((s, l) => s + Number(l.service.price) * l.qty, 0);
    const paidState = i % 9 === 0 ? 'SENT' : i % 7 === 0 ? 'PARTIALLY_PAID' : 'PAID';
    invoiceSeq += 1;
    const invoice = await prisma.invoice.create({
      data: {
        organizationId: org.id, branchId: main.id, patientId: patient.id, appointmentId: appt.id,
        invoiceNumber: `INV-${String(invoiceSeq).padStart(6, '0')}`, subtotal: dec(subtotal), total: dec(subtotal), status: paidState,
        dueDate: new Date(start.getTime() + 7 * 86_400_000), createdBy: receptionist.id, createdAt: start,
        items: { create: lines.map((l) => ({ organizationId: org.id, branchId: main.id, itemName: l.service.name, serviceId: l.service.id, quantity: l.qty, unitPrice: l.service.price, amount: dec(Number(l.service.price) * l.qty) })) },
      },
    });
    if (paidState !== 'SENT') {
      const amount = paidState === 'PAID' ? subtotal : Math.round(subtotal / 2);
      await prisma.payment.create({
        data: { organizationId: org.id, branchId: main.id, invoiceId: invoice.id, amount: dec(amount), paymentMethod: pick(['CASH', 'UPI', 'CARD']), paymentStatus: 'PAID', paidAt: end, createdById: receptionist.id },
      });
    }

    if (i % 4 === 0) {
      const due = new Date(start.getTime() + 14 * 86_400_000);
      await prisma.followUp.create({
        data: { organizationId: org.id, branchId: main.id, patientId: patient.id, doctorId: d.id, consultationId: consult.id, scheduledDate: due, reason: `Review: ${dx.name}`, status: due < new Date() ? (i % 8 === 0 ? 'COMPLETED' : 'MISSED') : 'PENDING' },
      });
    }
  }

  // Today and upcoming appointments for the live demo (queue, reminders, calendar).
  const todayQueue = await prisma.queue.create({ data: { organizationId: org.id, branchId: main.id, name: 'OPD Queue' } });
  for (let i = 0; i < 14; i++) {
    const d = doctors[i % 2];
    const daysAhead = i < 6 ? 0 : faker.number.int({ min: 1, max: 10 });
    const baseHour = d.id === owner.id ? 10 : 16;
    const start = at(daysAhead, baseHour + Math.floor((i % 6) / 2), (i % 2) * 30);
    const appt = await prisma.appointment.create({
      data: { organizationId: org.id, branchId: main.id, patientId: mainPatients[i].id, doctorId: d.id, appointmentType: 'CONSULTATION', appointmentSource: 'PHONE', scheduledStart: start, scheduledEnd: new Date(start.getTime() + 15 * 60_000), status: daysAhead === 0 && i < 3 ? 'CHECKED_IN' : 'SCHEDULED', createdBy: receptionist.id },
    });
    if (daysAhead === 0 && i < 3) {
      await prisma.queueEntry.create({ data: { organizationId: org.id, branchId: main.id, queueId: todayQueue.id, appointmentId: appt.id, tokenNumber: i + 1, checkInTime: new Date(), status: 'WAITING' } });
    }
  }
  await prisma.followUp.create({
    data: { organizationId: org.id, branchId: main.id, patientId: mainPatients[20].id, doctorId: owner.id, scheduledDate: at(1, 11), reason: 'BP review', status: 'PENDING' },
  });

  // Reputation & growth
  for (const appt of completedAppointments.slice(0, 18)) {
    await prisma.review.create({
      data: { organizationId: org.id, branchId: main.id, patientId: appt.patientId, doctorId: appt.doctorId, rating: pick([5, 5, 5, 4, 4, 3]), npsScore: pick([10, 9, 9, 8, 7, 6]), reviewText: pick(['Very thorough and kind.', 'Short waiting time, great staff.', 'Doctor explained everything clearly.', 'Good experience overall.']), source: 'REVIEW_REQUEST', isPublic: true },
    });
  }
  await prisma.reviewRequest.create({
    data: { organizationId: org.id, branchId: main.id, patientId: completedAppointments[20].patientId, doctorId: completedAppointments[20].doctorId, appointmentId: completedAppointments[20].id, token: randomBytes(24).toString('base64url'), channel: 'WHATSAPP', status: 'SENT', sentAt: new Date(), expiresAt: new Date(Date.now() + 14 * 86_400_000) },
  });
  for (let i = 0; i < 6; i++) {
    await prisma.referral.create({
      data: { organizationId: org.id, branchId: main.id, patientId: mainPatients[i + 2].id, source: 'PATIENT', referredName: faker.person.fullName(), referredPhone: `9${faker.string.numeric(9)}`, status: pick(['NEW', 'CONTACTED', 'CONVERTED']) },
    });
  }

  // Tasks & workflow
  await prisma.task.createMany({
    data: [
      { organizationId: org.id, branchId: main.id, title: 'Call patients with missed follow-ups', assignedTo: receptionist.id, priority: 'HIGH', status: 'OPEN', dueDate: at(0, 18), createdBy: admin.id },
      { organizationId: org.id, branchId: main.id, title: 'Reconcile UPI collections for the week', assignedTo: accountant.id, priority: 'MEDIUM', status: 'IN_PROGRESS', dueDate: at(2, 18), createdBy: admin.id },
      { organizationId: org.id, branchId: main.id, title: 'Restock nebuliser masks', assignedTo: nurse.id, priority: 'LOW', status: 'OPEN', dueDate: at(3, 12), createdBy: owner.id },
    ],
  });
  await prisma.workflowTemplate.create({
    data: {
      organizationId: org.id, name: 'New diabetic patient onboarding', description: 'Standard first-month care plan', trigger: 'MANUAL', createdBy: owner.id,
      steps: [
        { title: 'Schedule HbA1c lab test', offsetDays: 0, assigneeRole: 'Receptionist' },
        { title: 'Diet counselling call', offsetDays: 3, assigneeRole: 'Nurse' },
        { title: 'Doctor review of lab results', offsetDays: 7, assigneeRole: 'Doctor' },
      ],
    },
  });

  const logins = [
    ['Owner (also Doctor)', owner.email],
    ['Clinic Admin', admin.email],
    ['Branch Manager (Baner)', manager.email],
    ['Doctor', doctor.email],
    ['Receptionist', receptionist.email],
    ['Nurse', nurse.email],
    ['Accountant', accountant.email],
  ];
  console.log('\nDemo tenant ready. Logins (password: ' + (process.env.SEED_PASSWORD ? '$SEED_PASSWORD' : PASSWORD) + '):');
  for (const [role, email] of logins) console.log(`  ${role.padEnd(24)} ${email}`);
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
