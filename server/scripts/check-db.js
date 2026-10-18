/**
 * Database preflight — `npm run db:ping`.
 *
 * Answers one question before anything else runs: *can this API reach its Neon
 * project, and is the schema in place?* It prints the endpoint (password masked),
 * the round-trip, the settings the naive `timestamp` columns depend on, the row
 * counts and the migration state — and exits non-zero with a specific hint instead
 * of a driver stack trace.
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

const { close, ping, query, target } = await import('../src/db/index.js').catch((err) =>
  fail(
    String(err.message).split('\n')[0],
    'DATABASE_URL in server/.env must be the pooled connection string from the Neon console ' +
      '(Project → Connection details, the host ends in "-pooler…")',
  ),
);

console.log(`\nNeon preflight\n${'─'.repeat(60)}`);
console.log(`  DATABASE_URL      ${mask(process.env.DATABASE_URL)}`);
console.log(`  via               ${target.endpoint}`);

const started = process.hrtime.bigint();
try {
  await Promise.race([
    ping(),
    new Promise((_, reject) => setTimeout(() => reject(new Error('no answer within 10s')), 10_000)),
  ]);
} catch (err) {
  // the driver wraps the socket failure, so the useful `code` can be a few
  // `cause`/`sourceError` levels down
  const seen = [];
  for (let cur = err; cur && seen.length < 6; cur = cur.cause ?? cur.sourceError) {
    if (cur.code) seen.push(String(cur.code));
    if (cur.message) seen.push(String(cur.message));
    if (cur === cur.cause) break;
  }
  const text = seen.join(' ');
  const hints = [
    [/ECONNRESET|fetch failed|socket closed/, 'the connection was reset — a proxy or firewall is blocking HTTPS to *.neon.tech. Try the direct endpoint instead of the pooled one (or the other way round), another network, or a machine with a route to Neon.'],
    [/ENOTFOUND|getaddrinfo/, 'the host does not resolve — check the endpoint in DATABASE_URL (Neon console → Connection details).'],
    [/ECONNREFUSED/, 'nothing answered on that host — the endpoint is mistyped, or the project was deleted.'],
    [/no answer within/, 'the host answered but nothing came back — a firewall dropping packets, or the project is suspended (wake it from the console).'],
    [/password authentication failed|invalid password/, 'the role or password is not the one Neon issued — copy the string again from the console.'],
    [/database "[^"]*" does not exist/, 'the database name in the URL is not the one the project created (Neon uses "neondb" by default).'],
    [/role "[^"]*" does not exist/, 'that role does not exist in this project — copy the whole connection string from the console.'],
    [/SSL|TLS|server certificate/i, 'TLS failed — keep `?sslmode=require` in the URL (that part matters for `drizzle-kit`, which uses the wire protocol).'],
  ];
  fail(
    `cannot reach Neon (${String(err?.message).split('\n')[0]})`,
    hints.find(([re]) => re.test(text))?.[1] ?? `code: ${err?.code ?? 'n/a'}`,
  );
}
const ms = Number(process.hrtime.bigint() - started) / 1e6;
console.log(`  connect           ok in ${ms.toFixed(0)} ms`);

const [server] = await query(
  `select version() as version, current_database() as database, current_user as "user",
          (select setting from pg_settings where name = 'TimeZone') as timezone,
          (select count(*)::int from pg_tables where schemaname = 'public') as tables`,
);
console.log(`  server            ${String(server.version).split(',')[0]} · db "${server.database}" as ${server.user}`);
console.log(`  session           TimeZone=${server.timezone} (the naive timestamp columns expect UTC)`);
if (!/utc/i.test(server.timezone)) {
  console.log(
    '                    ⚠️  Neon projects run with TimeZone=UTC; if this was changed, `defaultNow()`\n' +
      '                        on a timestamp-without-time-zone column stores a different wall clock.\n' +
      '                        Reset it: ALTER ROLE neondb_owner SET timezone = UTC  (or the project setting)',
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
    (
      await query('select hash::text as hash, created_at::text as created_at from drizzle.__drizzle_migrations')
    ).map((row) => [row.hash, row.created_at]),
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
    missing.length
      ? `run: npm run db:migrate — pending: ${missing.join(', ')}`
      : 'run: npm run db:migrate',
  );
}
if (missing.length) {
  fail(`migrations not applied yet: ${missing.join(', ')}`, 'run: npm run db:migrate');
}
console.log(`  migrations        ${applied.size} applied, journal fully covered ✓`);

await close();
console.log('\n✔ Ready — the API can use this Neon database.\n');
