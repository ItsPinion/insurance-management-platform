// Seed: one admin + one agent + one demo customer account
// Run: node prisma/seed.js
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { createPrismaClient } from '../src/lib/prisma.js';

const prisma = createPrismaClient();

const users = [
  { name: 'System Admin', email: 'admin@insure.test', password: 'Admin@123', role: 'ADMIN' },
  { name: 'Agent Smith', email: 'agent@insure.test', password: 'Agent@123', role: 'AGENT' },
  { name: 'Asha Verma', email: 'asha@insure.test', password: 'Asha@1234', role: 'CUSTOMER' },
];

for (const u of users) {
  const password = await bcrypt.hash(u.password, 10);
  await prisma.user.upsert({
    where: { email: u.email },
    update: {},
    create: { ...u, password },
  });
  console.log(`✔ ${u.role.padEnd(8)} ${u.email} / ${u.password}`);
}

// Link the demo customer user to a Customer record
const customerUser = await prisma.user.findUnique({ where: { email: 'asha@insure.test' } });
await prisma.customer.upsert({
  where: { email: 'asha@insure.test' },
  update: {},
  create: {
    name: 'Asha Verma',
    dob: new Date('1992-04-18'),
    phone: '9812345210',
    address: '12 Lake Road, Pune',
    email: 'asha@insure.test',
    userId: customerUser.id,
  },
});
console.log('✔ Demo customer profile linked');

await prisma.$disconnect();
