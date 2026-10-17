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
import { db, pool } from '../src/db/index.js';
import {
  claims,
  customers,
  documents,
  policies,
  premiumPayments,
  users,
} from '../src/db/schema.js';
import { BASE_USERS, DEMO_CUSTOMERS } from './fixtures/demo-data.mjs';

// createdAt and updatedAt are written together — and each row of the demo
// dataset one millisecond after the previous one — so that the list and the
// history endpoints, which sort by createdAt, have a deterministic order
let tick = 0;
const stamps = () => {
  const now = new Date(Date.now() + tick);
  tick += 1;
  return { createdAt: now, updatedAt: now };
};

// 1. wipe everything that the API/screenshot tests produced (children first —
//    the foreign keys are ON DELETE RESTRICT, just like in production)
await db.delete(documents);
await db.delete(claims);
await db.delete(premiumPayments);
await db.delete(policies);
await db.delete(customers);
await db.delete(users);
console.log('✔ cleared customers, policies, claims, payments, documents and users');

// 2. base accounts
const userIds = {};
for (const u of BASE_USERS) {
  const password = await bcrypt.hash(u.password, 10);
  const [created] = await db
    .insert(users)
    .values({ name: u.name, email: u.email, password, role: u.role, ...stamps() })
    .returning({ id: users.id });
  userIds[u.email] = created.id;
  console.log(`✔ ${u.role.padEnd(8)} ${u.email} / ${u.password}`);
}

// 3. the demo customer profile linked to the customer account
await db.insert(customers).values({
  name: 'Asha Verma',
  dob: new Date('1992-04-18'),
  phone: '9812345210',
  address: '12 Lake Road, Pune',
  email: 'asha@insure.test',
  userId: userIds['asha@insure.test'],
  ...stamps(),
});
console.log('✔ demo customer profile linked');

// 4. demo customers + their linked records
for (const d of DEMO_CUSTOMERS) {
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
    .returning({ id: customers.id, name: customers.name });

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
      .returning({ id: policies.id });

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
console.log('\nDemo database ready.');
