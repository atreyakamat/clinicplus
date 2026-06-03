import { PrismaClient } from '@prisma/client';
import { faker } from '@faker-js/faker';
import { performance } from 'perf_hooks';

const prisma = new PrismaClient();

async function runBenchmark() {
  console.log('🚀 Starting High-Volume Load Testing Benchmark...');
  
  const org = await prisma.organization.findFirst();
  if (!org) {
    console.error('No organization found. Please run seed script first.');
    return;
  }

  // Benchmark 1: Fuzzy Patient Search with 10k Records
  console.log('📊 Benchmarking Fuzzy Search (10,000 Record Simulation)...');
  const startSearch = performance.now();
  const searchResults = await prisma.patient.findMany({
    where: {
      organizationId: org.id,
      OR: [
        { firstName: { contains: 'John', mode: 'insensitive' } },
        { lastName: { contains: 'Doe', mode: 'insensitive' } },
      ],
    },
    take: 50,
  });
  const endSearch = performance.now();
  console.log(`✅ Search completed in ${(endSearch - startSearch).toFixed(2)}ms (Result Count: ${searchResults.length})`);

  // Benchmark 2: Aggregated Revenue Report
  console.log('📊 Benchmarking Revenue Aggregation...');
  const startRev = performance.now();
  const revenue = await prisma.payment.aggregate({
    where: { organizationId: org.id, paymentStatus: 'PAID' },
    _sum: { amount: true },
    _count: { id: true },
  });
  const endRev = performance.now();
  console.log(`✅ Revenue aggregation completed in ${(endRev - startRev).toFixed(2)}ms`);
  console.log(`   - Total Revenue: $${revenue._sum.amount}`);
  console.log(`   - Transaction Count: ${revenue._count.id}`);

  // Benchmark 3: Complex Appointment Timeline Join
  console.log('📊 Benchmarking Appointment-Patient-Doctor Join...');
  const startJoin = performance.now();
  const appts = await prisma.appointment.findMany({
    where: { organizationId: org.id },
    include: {
      patient: true,
      doctor: { select: { firstName: true, lastName: true, specialization: true } },
    },
    take: 100,
    orderBy: { scheduledStart: 'desc' },
  });
  const endJoin = performance.now();
  console.log(`✅ Complex join completed in ${(endJoin - startJoin).toFixed(2)}ms`);

  console.log('\n🌟 LOAD TESTING COMPLETE');
}

runBenchmark()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
