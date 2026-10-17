// Seed: one admin + one agent + one demo customer account
// Run: node scripts/seed.js
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { db, pool } from '../src/db/index.js';
import { customers, users } from '../src/db/schema.js';

const baseUsers = [
  { name: 'System Admin', email: 'admin@insure.test', password: 'Admin@123', role: 'ADMIN' },
  { name: 'Agent Smith', email: 'agent@insure.test', password: 'Agent@123', role: 'AGENT' },
  { name: 'Asha Verma', email: 'asha@insure.test', password: 'Asha@1234', role: 'CUSTOMER' },
];

for (const u of baseUsers) {
  const password = await bcrypt.hash(u.password, 10);
  const now = new Date();
  // Re-running the seed must not clobber an account that already exists.
  await db
    .insert(users)
    .values({ ...u, password, createdAt: now, updatedAt: now })
    .onConflictDoNothing({ target: users.email });
  console.log(`✔ ${u.role.padEnd(8)} ${u.email} / ${u.password}`);
}

// Link the demo customer user to a Customer record
const [customerUser] = await db
  .select({ id: users.id })
  .from(users)
  .where(eq(users.email, 'asha@insure.test'));

const profileStamp = new Date();
await db
  .insert(customers)
  .values({
    name: 'Asha Verma',
    dob: new Date('1992-04-18'),
    phone: '9812345210',
    address: '12 Lake Road, Pune',
    email: 'asha@insure.test',
    userId: customerUser.id,
    createdAt: profileStamp,
    updatedAt: profileStamp,
  })
  .onConflictDoNothing({ target: customers.email });
console.log('✔ Demo customer profile linked');

await pool.end();
