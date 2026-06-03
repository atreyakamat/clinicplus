"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const faker_1 = require("@faker-js/faker");
const bcrypt = __importStar(require("bcryptjs"));
const prisma = new client_1.PrismaClient();
async function main() {
    console.log('🚀 Starting Master Production Readiness Seeding...');
    const passwordHash = await bcrypt.hash('password123', 10);
    const orgs = await Promise.all([
        { name: 'City General Hospital', slug: 'city-general' },
        { name: 'Metro Dental Care', slug: 'metro-dental' },
        { name: 'Westside Pediatrics', slug: 'westside-peds' },
    ].map(org => prisma.organization.upsert({
        where: { slug: org.slug },
        update: {},
        create: {
            ...org,
            subscriptionPlan: 'ENTERPRISE',
            subscriptionStatus: 'ACTIVE',
            primaryColor: '#1FA971',
            secondaryColor: '#2563EB',
            footerText: 'Powered by ClinicOS - Advanced Healthcare OS'
        }
    })));
    const branches = await Promise.all(orgs.map(org => prisma.branch.create({
        data: { name: `${org.name} Main Branch`, organizationId: org.id, address: faker_1.faker.location.streetAddress() }
    })));
    const doctors = await Promise.all(branches.map((branch, i) => prisma.user.create({
        data: {
            email: `doctor${i + 1}@clinicos.com`,
            passwordHash,
            firstName: faker_1.faker.person.firstName(),
            lastName: faker_1.faker.person.lastName(),
            organizationId: branch.organizationId,
            branchId: branch.id,
        }
    })));
    const receptionists = await Promise.all(branches.map((branch, i) => prisma.user.create({
        data: {
            email: `receptionist${i + 1}@clinicos.com`,
            passwordHash,
            firstName: faker_1.faker.person.firstName(),
            lastName: faker_1.faker.person.lastName(),
            organizationId: branch.organizationId,
            branchId: branch.id,
        }
    })));
    console.log('✅ Infrastructure Ready.');
    console.log('📥 Seeding 1000 Patients...');
    const patientBatches = 10;
    const patientsPerBatch = 100;
    for (let i = 0; i < patientBatches; i++) {
        const branch = faker_1.faker.helpers.arrayElement(branches);
        const doctor = doctors.find(d => d.organizationId === branch.organizationId);
        const batch = Array.from({ length: patientsPerBatch }).map(() => ({
            organizationId: branch.organizationId,
            branchId: branch.id,
            patientCode: `PT-${faker_1.faker.string.alphanumeric(8).toUpperCase()}`,
            firstName: faker_1.faker.person.firstName(),
            lastName: faker_1.faker.person.lastName(),
            email: faker_1.faker.internet.email(),
            phone: faker_1.faker.phone.number(),
            gender: faker_1.faker.helpers.arrayElement(['Male', 'Female', 'Other']),
            dateOfBirth: faker_1.faker.date.birthdate({ min: 0, max: 90, mode: 'age' }),
            bloodGroup: faker_1.faker.helpers.arrayElement(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']),
            createdBy: doctor.id,
        }));
        await prisma.patient.createMany({ data: batch });
        console.log(`   - Batch ${i + 1}/${patientBatches} completed.`);
    }
    const dbPatients = await prisma.patient.findMany({ select: { id: true, organizationId: true, branchId: true } });
    console.log('📅 Seeding 5000 Appointments...');
    const appointmentBatches = 10;
    const apptsPerBatch = 500;
    for (let i = 0; i < appointmentBatches; i++) {
        const batch = Array.from({ length: apptsPerBatch }).map(() => {
            const patient = faker_1.faker.helpers.arrayElement(dbPatients);
            const doctor = doctors.find(d => d.organizationId === patient.organizationId);
            const start = faker_1.faker.date.between({ from: '2026-01-01', to: '2026-12-31' });
            const end = new Date(start.getTime() + 30 * 60000);
            return {
                organizationId: patient.organizationId,
                branchId: patient.branchId,
                patientId: patient.id,
                doctorId: doctor.id,
                scheduledStart: start,
                scheduledEnd: end,
                status: faker_1.faker.helpers.arrayElement(['SCHEDULED', 'CONFIRMED', 'COMPLETED', 'CANCELLED', 'NO_SHOW']),
                createdBy: doctor.id,
            };
        });
        await prisma.appointment.createMany({ data: batch });
        console.log(`   - Batch ${i + 1}/${appointmentBatches} completed.`);
    }
    console.log('🩺 Seeding 3000 Consultations...');
    const completedAppointments = await prisma.appointment.findMany({
        where: { status: 'COMPLETED' },
        take: 3000,
        select: { id: true, patientId: true, doctorId: true, organizationId: true, branchId: true, scheduledStart: true }
    });
    for (const appt of completedAppointments) {
        await prisma.consultation.create({
            data: {
                organizationId: appt.organizationId,
                branchId: appt.branchId,
                patientId: appt.patientId,
                doctorId: appt.doctorId,
                appointmentId: appt.id,
                chiefComplaint: faker_1.faker.lorem.sentence(),
                clinicalAssessment: faker_1.faker.lorem.paragraphs(2),
                treatmentPlan: faker_1.faker.lorem.paragraph(),
                status: 'COMPLETED',
                consultationDate: appt.scheduledStart,
                vitals: {
                    create: {
                        organizationId: appt.organizationId,
                        branchId: appt.branchId,
                        weight: faker_1.faker.number.float({ min: 40, max: 120, fractionDigits: 1 }),
                        height: faker_1.faker.number.float({ min: 140, max: 200, fractionDigits: 1 }),
                        temperature: faker_1.faker.number.float({ min: 36, max: 40, fractionDigits: 1 }),
                        pulse: faker_1.faker.number.int({ min: 60, max: 100 }),
                        bloodPressureSystolic: faker_1.faker.number.int({ min: 110, max: 140 }),
                        bloodPressureDiastolic: faker_1.faker.number.int({ min: 70, max: 90 }),
                    }
                },
                diagnoses: {
                    create: {
                        organizationId: appt.organizationId,
                        branchId: appt.branchId,
                        diagnosisName: faker_1.faker.helpers.arrayElement(['Hypertension', 'Type 2 Diabetes', 'Acute Pharyngitis', 'Lower Back Pain', 'Common Cold']),
                        severity: 'MEDIUM'
                    }
                }
            }
        });
    }
    console.log('💊 Seeding 3000 Prescriptions...');
    const consultations = await prisma.consultation.findMany({ take: 3000, select: { id: true, patientId: true, doctorId: true, organizationId: true, branchId: true } });
    for (const cons of consultations) {
        await prisma.prescription.create({
            data: {
                organizationId: cons.organizationId,
                branchId: cons.branchId,
                patientId: cons.patientId,
                doctorId: cons.doctorId,
                consultationId: cons.id,
                items: {
                    create: Array.from({ length: faker_1.faker.number.int({ min: 1, max: 4 }) }).map(() => ({
                        organizationId: cons.organizationId,
                        branchId: cons.branchId,
                        medicineName: faker_1.faker.helpers.arrayElement(['Amoxicillin', 'Lisinopril', 'Metformin', 'Atorvastatin', 'Ibuprofen']),
                        dosage: '1 tablet',
                        frequency: '1-0-1',
                        duration: '5 days',
                        instructions: 'After food'
                    }))
                }
            }
        });
    }
    console.log('🧾 Seeding 3000 Invoices...');
    for (const cons of consultations) {
        const subtotal = faker_1.faker.number.int({ min: 50, max: 500 });
        await prisma.invoice.create({
            data: {
                organizationId: cons.organizationId,
                branchId: cons.branchId,
                patientId: cons.patientId,
                invoiceNumber: `INV-${faker_1.faker.string.alphanumeric(8).toUpperCase()}`,
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
                        paymentMethod: 'CASH',
                        paymentStatus: 'PAID'
                    }
                }
            }
        });
    }
    console.log('🔄 Seeding Tasks, Reviews, Referrals, Follow-ups...');
    await prisma.followUp.createMany({
        data: Array.from({ length: 1000 }).map(() => {
            const p = faker_1.faker.helpers.arrayElement(dbPatients);
            return {
                organizationId: p.organizationId,
                branchId: p.branchId,
                patientId: p.id,
                doctorId: doctors.find(d => d.organizationId === p.organizationId).id,
                scheduledDate: faker_1.faker.date.future(),
                status: 'PENDING'
            };
        })
    });
    await prisma.task.createMany({
        data: Array.from({ length: 200 }).map(() => {
            const branch = faker_1.faker.helpers.arrayElement(branches);
            return {
                organizationId: branch.organizationId,
                branchId: branch.id,
                title: faker_1.faker.hacker.phrase(),
                priority: faker_1.faker.helpers.arrayElement(['LOW', 'MEDIUM', 'HIGH', 'URGENT']),
                status: 'OPEN'
            };
        })
    });
    for (let i = 0; i < 100; i++) {
        const patient = faker_1.faker.helpers.arrayElement(dbPatients);
        const doctor = doctors.find(d => d.organizationId === patient.organizationId);
        await prisma.review.create({
            data: {
                organizationId: patient.organizationId,
                branchId: patient.branchId,
                patientId: patient.id,
                doctorId: doctor.id,
                rating: faker_1.faker.number.int({ min: 4, max: 5 }),
                reviewText: faker_1.faker.lorem.sentence()
            }
        });
    }
    for (let i = 0; i < 50; i++) {
        const patient = faker_1.faker.helpers.arrayElement(dbPatients);
        await prisma.referral.create({
            data: {
                organizationId: patient.organizationId,
                branchId: patient.branchId,
                patientId: patient.id,
                source: faker_1.faker.helpers.arrayElement(['Google', 'Facebook', 'Friend', 'Newspaper']),
                status: 'CONVERTED'
            }
        });
    }
    console.log('🌟 MASTER SEEDING COMPLETE!');
}
main()
    .catch((e) => {
    console.error(e);
    process.exit(1);
})
    .finally(async () => {
    await prisma.$disconnect();
});
//# sourceMappingURL=seed.js.map