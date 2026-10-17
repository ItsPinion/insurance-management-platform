/**
 * Seeds the demo dataset (customers + linked policies, claims, payments and
 * documents) so the customer screens and the history endpoint have content.
 *
 * Usage:  node tests/seed-demo-data.mjs
 */
import 'dotenv/config';
import { eq, inArray } from 'drizzle-orm';
import { db, pool } from '../src/db/index.js';
import { claims, customers, documents, policies, premiumPayments } from '../src/db/schema.js';
import { DEMO_CUSTOMERS } from './fixtures/demo-data.mjs';

// createdAt and updatedAt are written together — and each row of the demo
// dataset one millisecond after the previous one — so that the list and the
// history endpoints, which sort by createdAt, have a deterministic order
let tick = 0;
const stamps = () => {
  const now = new Date(Date.now() + tick);
  tick += 1;
  return { createdAt: now, updatedAt: now };
};

for (const d of DEMO_CUSTOMERS) {
  // Re-running the seed refreshes the profile instead of failing on the
  // unique email constraint.
  const [customer] = await db
    .insert(customers)
    .values({
      name: d.name,
      email: d.email,
      dob: d.dob,
      phone: d.phone,
      address: d.address,
      ...stamps(),
    })
    .onConflictDoUpdate({
      target: customers.email,
      set: { name: d.name, phone: d.phone, address: d.address, dob: d.dob, ...stamps() },
    })
    .returning();

  // Replace the linked demo rows so repeated runs stay idempotent.
  const policyIds = (
    await db.select({ id: policies.id }).from(policies).where(eq(policies.customerId, customer.id))
  ).map((row) => row.id);

  await db.delete(documents).where(eq(documents.customerId, customer.id));
  if (policyIds.length) {
    await db.delete(claims).where(inArray(claims.policyId, policyIds));
    await db.delete(premiumPayments).where(inArray(premiumPayments.policyId, policyIds));
    await db.delete(policies).where(inArray(policies.id, policyIds));
  }

  for (const p of d.policies) {
    const [policy] = await db
      .insert(policies)
      .values({
        policyNumber: p.policyNumber,
        policyType: p.policyType,
        premiumAmount: String(p.premiumAmount),
        startDate: p.startDate,
        endDate: p.endDate,
        status: p.status,
        customerId: customer.id,
        ...stamps(),
      })
      .returning();

    for (const c of p.claims) {
      await db.insert(claims).values({
        claimNumber: c.claimNumber,
        claimAmount: String(c.claimAmount),
        reason: c.reason,
        status: c.status,
        submissionDate: c.submissionDate,
        reviewRemarks: c.reviewRemarks ?? null,
        reviewedAt: c.reviewedAt ?? null,
        policyId: policy.id,
      });
    }

    for (const pay of p.payments) {
      await db.insert(premiumPayments).values({
        amount: String(pay.amount),
        dueDate: pay.dueDate,
        paymentDate: pay.paymentDate,
        paymentStatus: pay.paymentStatus,
        policyId: policy.id,
      });
    }
  }

  for (const doc of d.documents) {
    await db.insert(documents).values({ ...doc, customerId: customer.id });
  }

  console.log(`✔ ${customer.name} — ${d.policies.length} policies, ${d.documents.length} documents`);
}

await pool.end();
