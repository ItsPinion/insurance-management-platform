/**
 * Database preflight — `npm run db:ping`.
 *
 * Answers one question before anything else runs: *can this API reach the
 * database you configured, and is the schema in place?* It prints the driver, the
 * endpoint (password masked), the round-trip, the PostgreSQL-side settings that
 * the naive `timestamp` columns depend on, the row counts and the migration
 * state — and exits non-zero with a hint when something is missing.
 *
 * Nothing here writes to the database.
 */
import 'dotenv/config';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const tableNames = ['User', 'Customer', 'Policy', 'Claim', 'PremiumPayment', 'Document'];

const mask = (url) => url.replace(/\/\/([^:]+):([^@]*)@/, '//$1:••••••@');

const fail = (message, hint) => {
  console.error(`\n❌ ${message}`);
  if (hint) console.error(`   ↳ ${hint}`);
  process.exit(1);
};

const { driver, query, close, ping } = await import('../src/db/index.js').catch((err) =>
  fail(err.message, 'DATABASE_URL must be set in server/.env (see server/.env.example)'),
);

console.log(`\nDatabase preflight\n${'─'.repeat(60)}`);
console.log(`  DATABASE_URL      ${mask(process.env.DATABASE_URL)}`);
console.log(`  DB_DRIVER         ${driver} (from DB_DRIVER=${process.env.DB_DRIVER ?? 'unset → auto'})`);

const started = process.hrtime.bigint();
try {
  await Promise.race([
    ping(),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('no answer within 10s')), 10_000),
    ),
  ]);
} catch (err) {
  const reason = String(err?.message).split('\n')[0];
  // the drivers wrap the socket failure, so the useful `code` can be a few
  // `cause`/`sourceError` levels down
  const seen = [];
  for (let cur = err; cur && seen.length < 6; cur = cur.cause ?? cur.sourceError) {
    if (cur.code) seen.push(String(cur.code));
    if (cur.message) seen.push(String(cur.message));
    if (cur === cur.cause) break;
  }
  const text = seen.join(' ');
  const hints = [
    [/ECONNRESET|fetch failed|other closed/, 'the connection was reset — a proxy or firewall is blocking port 5432/443. Try the other endpoint (pooled ↔ direct), another network, or a machine with a route to Neon.'],
    [/ENOTFOUND|getaddrinfo/, 'the host does not resolve — check the endpoint in DATABASE_URL (Neon console → Connection details).'],
    [/ECONNREFUSED/, 'nothing is listening on that host/port — is the Neon project awake (projects autosuspend), or is the local cluster running?'],
    [/no answer within/, 'the host answered but nothing came back — a firewall dropping packets, or the project is suspended.'],
    [/password authentication failed/, 'the role or password is not the one Neon issued — copy the string again from the console.'],
    [/database "[^"]*" does not exist/, 'the database name in the URL is not the one the project created (Neon uses "neondb" by default).'],
    [/SSL|TLS|server certificate/i, 'TLS failed — Neon needs `?sslmode=require` in the URL; a local cluster usually does not have it.'],
  ];
  const hint = hints.find(([re]) => re.test(text))?.[1];
  fail(`cannot reach the database (${reason})`, hint ?? `code: ${err?.code ?? 'n/a'}`);
}
const ms = Number(process.hrtime.bigint() - started) / 1e6;
console.log(`  connect           ok in ${ms.toFixed(0)} ms`);

const [server] = await query(
  `select version() as version, current_database() as database, current_user as "user",
          (select setting from pg_settings where name = 'TimeZone') as timezone,
          (select count(*)::int from pg_tables where schemaname = 'public') as tables`,
);
console.log(`  server            ${String(server.version).split(', ')[0]} · db "${server.database}" as ${server.user}`);
console.log(`  session           TimeZone=${server.timezone} (the naive timestamp columns expect UTC)`);
if (!/utc/i.test(server.timezone)) {
  console.log(
    `                    ⚠️  Neon projects default to UTC; a different zone shifts what now() writes into\n` +
      `                        timestamp-without-time-zone columns that have a database default`,
  );
}

const counts = [];
for (const table of tableNames) {
  const exists = await query(`select to_regclass('public."${table}"')::text as name`);
  if (!exists[0]?.name) {
    counts.push(`${table}=missing`);
    continue;
  }
  const rows = await query(`select count(*)::int as n from public."${table}"`);
  counts.push(`${table}=${rows[0].n}`);
}
console.log(`  tables            ${server.tables} in public · ${counts.join(' · ')}`);
if (counts.some((entry) => entry.endsWith('=missing'))) {
  fail('the schema is not there yet', 'run: npm run db:migrate   (then npm run db:seed)');
}

// --- migration state: journal vs the history table --------------------------

const root = path.join(HERE, '..');
const journal = JSON.parse(fs.readFileSync(path.join(root, 'drizzle/meta/_journal.json'), 'utf8'));
let applied = new Map();
try {
  applied = new Map(
    (await query('select hash::text as hash, created_at::text as created_at from drizzle.__drizzle_migrations')).map(
      (row) => [row.hash, row.created_at],
    ),
  );
} catch {
  /* the table does not exist yet — handled below */
}

const missing = [];
for (const entry of journal.entries) {
  const file = path.join(root, 'drizzle', `${entry.tag}.sql`);
  if (!fs.existsSync(file)) {
    missing.push(`${entry.tag} (migration file not found)`);
    continue;
  }
  const hash = crypto.createHash('sha256').update(fs.readFileSync(file, 'utf8')).digest('hex');
  if (!applied.has(hash)) missing.push(entry.tag);
}

if (applied.size === 0) {
  fail(
    'drizzle.__drizzle_migrations is empty, so db:migrate would try to create everything',
    missing.length ? `run: npm run db:migrate — pending: ${missing.join(', ')}` : 'run: npm run db:migrate',
  );
}
if (missing.length) {
  fail(`migrations not applied yet: ${missing.join(', ')}`, 'run: npm run db:migrate');
}
console.log(`  migrations        ${applied.size} applied, journal fully covered ✓`);

await close();
console.log(`\n✔ Ready — the API can use this database.\n`);
