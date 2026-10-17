/**
 * Database access.
 *
 * The platform runs on managed PostgreSQL — Neon by default — and the schema in
 * ./schema.js is the client (Drizzle needs no code generation and ships no query
 * engine binary). `DB_DRIVER` chooses how the API reaches the database:
 *
 *   'neon'  Neon's serverless driver over HTTPS (drizzle-orm/neon-http). No
 *           persistent connections, so it works on serverless/edge runtimes and
 *           never exhausts a Neon pool. This is the default for Neon URLs.
 *   'pg'    node-postgres connection pool (drizzle-orm/node-postgres). Preferred
 *           for a long-lived server or a local cluster: one TCP connection per
 *           request batch instead of an HTTPS round-trip per statement.
 *
 * Both drivers run the exact same queries against the exact same schema, so no
 * route or response changes between them; `server/tests/neon-driver.test.mjs`
 * pins that equality down.
 */
import 'dotenv/config';
import { neon, neonConfig } from '@neondatabase/serverless';
import { drizzle as drizzleNeonHttp } from 'drizzle-orm/neon-http';
import { drizzle as drizzleNodePg } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema.js';

const { DATABASE_URL, DB_DRIVER, DATABASE_POOL_MAX = '10' } = process.env;

if (!DATABASE_URL) {
  throw new Error(
    'DATABASE_URL is not set — copy server/.env.example to server/.env and fill it in.',
  );
}

// A Neon endpoint is recognised by its host; anything else is treated as a plain
// PostgreSQL server, which keeps local development working with no extra config.
const isNeonUrl = (url) => /\.neon\.(tech|ai)(:\d+)?\//.test(url) || /^neon:\/\//.test(url);

function resolveDriver() {
  const explicit = DB_DRIVER?.trim().toLowerCase();
  if (explicit === undefined || explicit === '' || explicit === 'auto') {
    return isNeonUrl(DATABASE_URL) ? 'neon' : 'pg';
  }
  if (explicit !== 'neon' && explicit !== 'pg') {
    throw new Error(`Unsupported DB_DRIVER "${DB_DRIVER}" — expected "neon" or "pg".`);
  }
  return explicit;
}

/** Which driver the process is talking to: `'neon'` (HTTP) or `'pg'` (TCP pool). */
export const driver = resolveDriver();

function connect() {
  if (driver === 'neon') {
    // `NEON_FETCH_ENDPOINT` redirects the driver to another gateway. The offline
    // driver test uses it to reach a local stand-in for Neon's proxy (see
    // tests/helpers/neon-http-proxy.mjs); a proxied or self-hosted deployment
    // points at its own endpoint the same way.
    if (process.env.NEON_FETCH_ENDPOINT) {
      neonConfig.fetchEndpoint = () => process.env.NEON_FETCH_ENDPOINT;
    }
    // `neon()` takes a PostgreSQL connection string and returns a callable that
    // issues statements over Neon's HTTP/S proxy instead of holding a socket open.
    const sql = neon(DATABASE_URL);
    return { db: drizzleNeonHttp(sql, { schema }), sql, pool: null };
  }
  const pool = new Pool({
    connectionString: DATABASE_URL,
    max: Number(DATABASE_POOL_MAX),
    // The timestamp columns are `timestamp(3)` without a time zone, so the session
    // is pinned to UTC: `defaultNow()` on a naive column stores the wall clock of
    // the session time zone, and UTC is what a Neon project runs with by default.
    options: '-c timezone=UTC',
  });
  return { db: drizzleNodePg(pool, { schema }), sql: null, pool };
}

const { db, sql, pool } = connect();

/** The Drizzle client — the only thing application code needs. */
export { db };

/**
 * Run a statement outside the query builder. `query` returns rows, `execute`
 * returns the driver's acknowledgement. Placeholders are `$1`, `$2`, … in both
 * drivers, so the two paths stay interchangeable.
 */
async function raw(text, params, { rows }) {
  if (driver === 'neon') {
    const result = await sql.query(text, params, { fullResults: true });
    return rows ? result.rows : result;
  }
  const result = await pool.query(text, params);
  return rows ? result.rows : result;
}

/** Rows for a read (`SELECT`) — used by diagnostics and the schema tests. */
export const query = (text, params = []) => raw(text, params, { rows: true });

/** Acknowledgement for a write (DDL, TRUNCATE, …) — rows are ignored. */
export const execute = (text, params = []) => raw(text, params, { rows: false });

/** Cheap liveness probe, so an unreachable database is visible at boot. */
export async function ping() {
  const rows = await query('SELECT 1 AS ok');
  return Number(rows[0]?.ok) === 1;
}

/** Release connections (a no-op for the HTTP driver, which keeps none open). */
export async function close() {
  if (pool) await pool.end();
}

export { schema };
