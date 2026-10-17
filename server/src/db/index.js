import 'dotenv/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema.js';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error(
    'DATABASE_URL is not set — copy server/.env.example to server/.env and fill it in.',
  );
}

/**
 * The Drizzle client. `pg` speaks the PostgreSQL protocol directly, so there
 * is no query engine binary to download and nothing to code-generate — the
 * schema in ./schema.js *is* the client.
 *
 * The timestamp columns are `timestamp(3)` without a time zone, so the session
 * is pinned to UTC: a date of birth written as `1990-04-12T00:00:00.000Z`
 * comes back as exactly the same instant instead of being shifted into the
 * local time zone of whatever machine runs the API.
 */
export const pool = new Pool({ connectionString, options: '-c timezone=UTC' });

export const db = drizzle(pool, { schema });

export { schema };
