/**
 * Seeds the demo dataset (customers + linked policies, claims, payments and
 * documents) so the customer screens and the history endpoint have content.
 *
 * Usage:  node tests/seed-demo-data.mjs
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { DEMO_CUSTOMERS } from './fixtures/demo-data.mjs';

const prisma = new PrismaClient();

for (const d of DEMO_CUSTOMERS) {
  const customer = await prisma.customer.upsert({
    where: { email: d.email },
    update: { name: d.name, phone: d.phone, address: d.address, dob: d.dob },
    create: { name: d.name, email: d.email, dob: d.dob, phone: d.phone, address: d.address },
  });

  // Replace the linked demo rows so repeated runs stay idempotent.
  await prisma.document.deleteMany({ where: { customerId: customer.id } });
  await prisma.claim.deleteMany({ where: { policy: { customerId: customer.id } } });
  await prisma.premiumPayment.deleteMany({ where: { policy: { customerId: customer.id } } });
  await prisma.policy.deleteMany({ where: { customerId: customer.id } });

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
