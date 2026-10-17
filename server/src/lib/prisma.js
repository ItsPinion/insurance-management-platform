import { PrismaPg } from '@prisma/adapter-pg';

let PrismaClient;
try {
  ({ PrismaClient } = await import('@prisma/client'));
} catch {
  throw new Error(
    'The Prisma client has not been generated yet — run `npm run prisma:generate` ' +
      'in server/ (or `npm install`) and try again.',
  );
}

/**
 * The Prisma client talks to PostgreSQL through the official `pg` driver
 * adapter. That makes the API independent of the engine Prisma was generated
 * with: the same code runs with the native query engine and with the WASM
 * engine (used when the engine binaries cannot be downloaded), because both
 * require the adapter to be supplied.
 */
export function createPrismaClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      'DATABASE_URL is not set — copy server/.env.example to server/.env and fill it in.',
    );
  }
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

export const prisma = createPrismaClient();
