/**
 * Driver equality test.
 *
 * The API can reach PostgreSQL through Neon's serverless HTTP driver (`DB_DRIVER=neon`)
 * or a node-postgres pool (`DB_DRIVER=pg`). Both must produce byte-identical JSON,
 * in any time zone, from the same data — so this file runs one workload through each
 * driver and compares the results.
 *
 * The HTTP driver is pointed at `tests/helpers/neon-http-proxy.mjs`: a local
 * stand-in for Neon's SQL-over-HTTP gateway that forwards statements to a real
 * cluster and answers in Neon's text protocol. The SQL, the type OIDs and the
 * driver's parsing are the production ones — only the network hop is local, so the
 * file runs with or without a route to Neon.
 *
 * Usage:  npm run test:driver
 *   DATABASE_URL        what the app is configured with (a Neon URL exercises the
 *                       neon driver; a local URL exercises pg) — the test points the
 *                       HTTP driver at the gateway itself, so this only decides
 *                       which driver the *application module* picks
 *   LOCAL_DATABASE_URL    the cluster the gateway forwards to; defaults to
 *                       DATABASE_URL, so against a real Neon project both drivers read
 *                       and write that project
 */
// Pinned before anything is imported, because a naive `timestamp` column is exactly
// where a local-time parse shows up: Asia/Kolkata is a half-hour-free offset that is
// not UTC, so a shifted read cannot hide.
process.env.TZ = 'Asia/Kolkata';

const { test, before, after } = await import('node:test');
const assert = (await import('node:assert/strict')).default;
const { count, eq, ilike } = await import('drizzle-orm');
const { drizzle: drizzleNodePg } = await import('drizzle-orm/node-postgres');
const { Pool } = await import('pg');
const schema = await import('../src/db/schema.js');
const { startNeonHttpProxy } = await import('./helpers/neon-http-proxy.mjs');

const { customers, documents, policies } = schema;

/** A row written by the fixture seed — its dates are the ones being asserted. */
const SEEDED_EMAIL = 'nita@insure.test';
/** Rows this file writes for itself. */
const probeEmail = (tag) => `driver.probe.${tag}@insure.test`;
const STAMP = new Date('2024-03-05T11:12:13.456Z');

let localUrl = null;
let proxy = null;
let pool = null;
let pg = null;
let neon = null;

before(async () => {
  // resolved here rather than at import time: the suite runs with the connection
  // string in `server/.env`, which `dotenv` has not read at module scope
  await import('dotenv/config');
  // the gateway needs a cluster it can reach over the wire protocol; when the app is
  // configured with a Neon URL that is what it forwards to, unless a second cluster
  // is named explicitly
  localUrl = process.env.LOCAL_DATABASE_URL ?? process.env.DATABASE_URL;
  assert.ok(
    localUrl,
    'this test needs a PostgreSQL cluster — set DATABASE_URL (or LOCAL_DATABASE_URL) or create server/.env',
  );

  proxy = await startNeonHttpProxy({ target: localUrl });

  // The application module resolves the driver from the URL's host, so a Neon-shaped
  // URL plus NEON_FETCH_ENDPOINT gives it a real Neon configuration that happens to
  // be served locally.
  process.env.DATABASE_URL =
    'postgresql://neondb_owner:npg_drivercheck@ep-driver-check-pooler.us-east-1.aws.neon.tech/neondb?sslmode=require';
  process.env.NEON_FETCH_ENDPOINT = proxy.endpoint;
  // 'auto' rather than 'neon': the host in the URL is what must choose the driver.
  process.env.DB_DRIVER = 'auto';
  const appDb = await import('../src/db/index.js');
  assert.equal(appDb.driver, 'neon', 'a Neon URL must select the Neon HTTP driver');
  neon = appDb.db;

  pool = new Pool({ connectionString: localUrl, options: '-c timezone=UTC' });
  pg = drizzleNodePg(pool, { schema });

  await pool.query(`DELETE FROM "Document" WHERE "customerId" IN (SELECT id FROM "Customer" WHERE "email" LIKE 'driver.probe.%')`);
  await pool.query(`DELETE FROM "Policy" WHERE "customerId" IN (SELECT id FROM "Customer" WHERE "email" LIKE 'driver.probe.%')`);
  await pool.query(`DELETE FROM "Customer" WHERE "email" LIKE 'driver.probe.%'`);
});

after(async () => {
  if (!pool) return;
  try {
    await pool.query(`DELETE FROM "Document" WHERE "customerId" IN (SELECT id FROM "Customer" WHERE "email" LIKE 'driver.probe.%')`);
    await pool.query(`DELETE FROM "Policy" WHERE "customerId" IN (SELECT id FROM "Customer" WHERE "email" LIKE 'driver.probe.%')`);
    await pool.query(`DELETE FROM "Customer" WHERE "email" LIKE 'driver.probe.%'`);
  } finally {
    if (pool) await pool.end();
    if (proxy) await proxy.stop();
  }
});

// --- the workload ----------------------------------------------------------

async function readSeeded(client) {
  const [profile] = await client
    .select()
    .from(customers)
    .where(eq(customers.email, SEEDED_EMAIL));
  const [page] = await client
    .select({ id: customers.id, name: customers.name })
    .from(customers)
    .where(ilike(customers.name, '%Rao%'))
    .orderBy(customers.id)
    .limit(5);
  const [counted] = await client.select({ total: count() }).from(customers);
  const [policy] = await client
    .select()
    .from(policies)
    .where(eq(policies.customerId, profile.id))
    .orderBy(policies.id)
    .limit(1);
  const docs = await client
    .select({ fileName: documents.fileName, mimeType: documents.mimeType, sizeBytes: documents.sizeBytes })
    .from(documents)
    .where(eq(documents.customerId, profile.id))
    .orderBy(documents.id);

  return { profile, page, counted, policy, docs };
}

test('a read workload returns the same JSON over both drivers', async () => {
  assert.deepEqual(
    JSON.stringify(await readSeeded(neon)),
    JSON.stringify(await readSeeded(pg)),
  );
});

// The columns are `timestamp(3) without time zone`. Both drivers hand back a value
// that Drizzle normalises to a UTC instant, which is what keeps a date of birth the
// day it was entered — asserted here from a non-UTC time zone, because a shifted read
// is invisible when the test process runs in UTC.
test('business dates are the UTC instants they were written as', async () => {
  for (const [name, result] of [['neon', await readSeeded(neon)], ['pg', await readSeeded(pg)]]) {
    assert.equal(
      new Date(result.profile.dob).toISOString(),
      '1990-04-12T00:00:00.000Z',
      `${name}: dob must not be shifted by the machine time zone (TZ=${process.env.TZ})`,
    );
    assert.equal(new Date(result.policy.startDate).toISOString(), '2024-01-15T00:00:00.000Z');
    // every timestamp field is an instant, not a wall clock that moved by the offset
    assert.match(new Date(result.profile.createdAt).toISOString(), /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  }
});

test('an aggregate is the same JSON number for both drivers', async () => {
  const overHttp = (await readSeeded(neon)).counted.total;
  const overPool = (await readSeeded(pg)).counted.total;
  // `count()` is a bigint, which the HTTP protocol carries as text; both drivers parse
  // it to a number, so `pagination.total` stays a JSON number in the response.
  assert.equal(Number(overHttp), Number(overPool));
  assert.equal(typeof overHttp, typeof overPool);
});

test('a row written over HTTP reads back the same through the pool (and the other way)', async () => {
  const write = async (client, tag) => {
    const [row] = await client
      .insert(customers)
      .values({
        name: `Driver Probe ${tag}`,
        email: probeEmail(tag),
        dob: new Date('1990-04-12'),
        phone: '9822001144',
        address: '14 Turner Road, Bengaluru',
        createdAt: STAMP,
        updatedAt: STAMP,
      })
      .returning();
    return row;
  };
  const drop = async (client, tag) => {
    await client.delete(customers).where(eq(customers.email, probeEmail(tag)));
  };

  const fromHttp = await write(neon, 'http');
  const fromPool = await write(pg, 'pool');
  try {
    const readBack = async (client, tag) => {
      const [row] = await client
        .select()
        .from(customers)
        .where(eq(customers.email, probeEmail(tag)));
      // id / name / email are how the two probe rows differ, by construction
      const { id, name, email, ...stored } = row;
      return stored;
    };
    const asJson = (rows) => JSON.stringify(rows);
    // identical instant, whichever driver wrote it and whichever reads it
    assert.equal(asJson(await readBack(pg, 'http')), asJson(await readBack(neon, 'pool')));
    assert.equal(asJson(await readBack(neon, 'http')), asJson(await readBack(pg, 'pool')));
    for (const row of [fromHttp, fromPool]) {
      assert.equal(new Date(row.dob).toISOString(), '1990-04-12T00:00:00.000Z');
      assert.equal(new Date(row.createdAt).toISOString(), STAMP.toISOString());
      assert.equal(new Date(row.updatedAt).toISOString(), STAMP.toISOString());
    }
  } finally {
    await drop(neon, 'http');
    await drop(pg, 'pool');
  }
});

test('a unique violation carries the same SQLSTATE through both drivers', async () => {
  const code = async (client) => {
    try {
      await client.insert(customers).values({
        name: 'Duplicate Probe',
        email: SEEDED_EMAIL,
        dob: new Date('1990-04-12'),
        phone: '9822001144',
        address: '14 Turner Road, Bengaluru',
        createdAt: STAMP,
        updatedAt: STAMP,
      });
    } catch (err) {
      const cause = err?.cause;
      return typeof cause?.code === 'string' ? cause.code : err?.code;
    }
    throw new Error('the duplicate insert should have been rejected');
  };
  assert.equal(await code(neon), '23505');
  assert.equal(await code(pg), '23505');
});

test('a database-generated timestamp is read as UTC', async () => {
  const [owner] = await pg
    .select({ id: customers.id })
    .from(customers)
    .where(eq(customers.email, SEEDED_EMAIL));

  // `uploadedAt` has no application value: the column default supplies it, so the
  // server's clock (UTC, on both a Neon project and this cluster) is what comes back.
  const insert = async (client) => {
    const [doc] = await client
      .insert(documents)
      .values({
        fileName: 'driver-probe.pdf',
        filePath: 'uploads/driver-probe.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 1024,
        docType: 'OTHER',
        customerId: owner.id,
      })
      .returning({ id: documents.id, uploadedAt: documents.uploadedAt });
    await client.delete(documents).where(eq(documents.id, doc.id));
    return doc;
  };

  for (const doc of [await insert(neon), await insert(pg)]) {
    const ageSeconds = (Date.now() - new Date(doc.uploadedAt).getTime()) / 1000;
    assert.ok(
      ageSeconds > -5 && ageSeconds < 120,
      `uploadedAt should be "now" in UTC (TZ=${process.env.TZ}), was ${new Date(
        doc.uploadedAt,
      ).toISOString()}`,
    );
  }
});

test('the HTTP path really went over the endpoint', async () => {
  assert.ok(proxy.statements.length > 0, 'the proxy saw no statements');
  assert.ok(
    proxy.statements.some((entry) => entry.sql.includes('"Customer"')),
    'no customer query was forwarded over HTTP',
  );
});
