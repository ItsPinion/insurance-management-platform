/**
 * Resets the database to a clean, reproducible demo state:
 *   - removes every record created by the test-suite / screenshot runs
 *   - recreates the three base accounts (admin, agent, customer)
 *   - reseeds the demo customers with their policies, claims, payments and
 *     documents
 *
 * Usage:  node tests/reset-demo-data.mjs
 */
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';
import { BASE_USERS, DEMO_CUSTOMERS } from './fixtures/demo-data.mjs';

const prisma = new PrismaClient();

// 1. wipe everything that the API/screenshot tests produced
await prisma.document.deleteMany();
await prisma.claim.deleteMany();
await prisma.premiumPayment.deleteMany();
await prisma.policy.deleteMany();
await prisma.customer.deleteMany();
await prisma.user.deleteMany();
console.log('✔ cleared customers, policies, claims, payments, documents and users');

// 2. base accounts
for (const u of BASE_USERS) {
  const password = await bcrypt.hash(u.password, 10);
  await prisma.user.create({
    data: { name: u.name, email: u.email, password, role: u.role },
  });
  console.log(`✔ ${u.role.padEnd(8)} ${u.email} / ${u.password}`);
}

// 3. the demo customer profile linked to the customer account
const customerUser = await prisma.user.findUnique({ where: { email: 'asha@insure.test' } });
await prisma.customer.create({
  data: {
    name: 'Asha Verma',
    dob: new Date('1992-04-18'),
    phone: '9812345210',
    address: '12 Lake Road, Pune',
    email: 'asha@insure.test',
    userId: customerUser.id,
  },
});
console.log('✔ demo customer profile linked');

// 4. demo customers + their linked records
for (const d of DEMO_CUSTOMERS) {
  const customer = await prisma.customer.create({
    data: { name: d.name, email: d.email, dob: d.dob, phone: d.phone, address: d.address },
  });

  for (const p of d.policies) {
    const policy = await prisma.policy.create({
      data: {
        policyNumber: p.policyNumber,
        policyType: p.policyType,
        premiumAmount: p.premiumAmount,
        startDate: p.startDate,
        endDate: p.endDate,
        status: p.status,
        customerId: customer.id,
      },
    });

    for (const c of p.claims) {
      await prisma.claim.create({
        data: {
          claimNumber: c.claimNumber,
          claimAmount: c.claimAmount,
          reason: c.reason,
          status: c.status,
          submissionDate: c.submissionDate,
          reviewRemarks: c.reviewRemarks ?? null,
          reviewedAt: c.reviewedAt ?? null,
          policyId: policy.id,
        },
      });
    }

    for (const pay of p.payments) {
      await prisma.premiumPayment.create({
        data: {
          amount: pay.amount,
          dueDate: pay.dueDate,
          paymentDate: pay.paymentDate,
          paymentStatus: pay.paymentStatus,
          policyId: policy.id,
        },
      });
    }
  }

  for (const doc of d.documents) {
    await prisma.document.create({ data: { ...doc, customerId: customer.id } });
  }
  console.log(`✔ ${customer.name} — ${d.policies.length} policies, ${d.documents.length} documents`);
}

await prisma.$disconnect();
console.log('\nDemo database ready.');
