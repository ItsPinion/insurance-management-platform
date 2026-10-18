/**
 * Database access — Neon, over Drizzle.
 *
 * There is exactly one supported target: a **Neon** PostgreSQL project, reached
 * through Neon's serverless driver (`@neondatabase/serverless`) and typed by the
 * schema in ./schema.js. No pool to size, no local cluster to install, no query
 * engine to download and no code-generation step: statements go out as HTTPS
 * requests to the project's SQL gateway, so the API holds no sockets open, works on
 * any runtime and cannot exhaust a Neon pool.
 *
 * Application code imports only `db`. The other exports exist for the preflight and
 * the scripts/tests, so no file outside this module needs to know about the driver.
 */
import 'dotenv/config';
import { neon, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from './schema.js';

const { DATABASE_URL, NEON_FETCH_ENDPOINT } = process.env;

if (!DATABASE_URL) {
  throw new Error(
    'DATABASE_URL is not set. Copy server/.env.example to server/.env and paste the ' +
      'pooled connection string from the Neon console (Project → Connection details).',
  );
}

// A Neon endpoint is recognised by its host, and a wrong one is a configuration
// mistake rather than a supported alternative — so this fails here, at boot, with
// the fix written out, instead of failing later as a stack of 500s. A proxied
// setup is exempt from the check, because the host in the URL is never dialled.
const NEON_HOST = /\.neon\.(tech|ai)(:\d+)?\/|^[a-z]+:\/\/[^/]*@ep-[^/]+\//;
if (!NEON_FETCH_ENDPOINT && !NEON_HOST.test(DATABASE_URL)) {
  const host = DATABASE_URL.replace(/^[^:]+:\/\/([^@]*@)?/, '').split('/')[0];
  throw new Error(
    `DATABASE_URL points at "${host}", which is not a Neon endpoint. This API uses a ` +
      'Neon database — paste the pooled string from the Neon console ' +
      '(ends in `-pooler.<region>.aws.neon.tech`, with ?sslmode=require), or set ' +
      'NEON_FETCH_ENDPOINT if Neon is fronted by a proxy.',
  );
}

// `NEON_FETCH_ENDPOINT` sends the driver's requests to another gateway: the one
// supported way to front Neon with a proxy (or to rehearse the exact HTTP protocol
// offline). It changes nothing about the SQL, the types or the responses.
if (NEON_FETCH_ENDPOINT) neonConfig.fetchEndpoint = () => NEON_FETCH_ENDPOINT;

/** Rows for a read, with the host and database they came from (for logs and `db:ping`). */
export const target = {
  host: DATABASE_URL.replace(/^[^:]+:\/\/([^@]*@)?/, '').split('/')[0],
  database: new URL(DATABASE_URL).pathname.slice(1),
  endpoint: NEON_FETCH_ENDPOINT ?? `https://${DATABASE_URL.replace(/^[^:]+:\/\/([^@]*@)?/, '').split('/')[0]}/sql`,
};

// `neon()` takes the PostgreSQL connection string and returns a callable that
// issues statements over Neon's HTTPS gateway; Drizzle types the results.
const sql = neon(DATABASE_URL);

/** The Drizzle client — the only thing application code needs. */
export const db = drizzle(sql, { schema });

/**
 * Run a statement outside the query builder, with `$1`, `$2`, … placeholders.
 * `query` returns rows; `execute` returns the gateway's acknowledgement.
 */
const raw = async (text, params, { rows }) => {
  const result = await sql.query(text, params, { fullResults: true });
  return rows ? result.rows : result;
};

/** Rows for a read (`SELECT`) — used by diagnostics and the schema tests. */
export const query = (text, params = []) => raw(text, params, { rows: true });

/** Acknowledgement for a write (DDL, TRUNCATE, …) — rows are ignored. */
export const execute = (text, params = []) => raw(text, params, { rows: false });

/** Cheap liveness probe, so an unreachable project is visible at boot. */
export async function ping() {
  const rows = await query('SELECT 1 AS ok');
  return Number(rows[0]?.ok) === 1;
}

/** Nothing to release — the HTTP driver keeps no connections open. */
export const close = async () => {};

export { schema };
