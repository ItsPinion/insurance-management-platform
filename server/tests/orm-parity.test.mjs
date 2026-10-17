/**
 * Response parity check for the ORM swap (Prisma → Drizzle).
 *
 * `tests/fixtures/api-baseline-prisma.json` holds the 31 responses the Prisma
 * implementation produced, captured from the running server before the swap:
 * every endpoint, every role, every error path. This suite replays exactly
 * those requests (see `tests/fixtures/api-cases.mjs`) against the current
 * server and compares the answers, one test per response.
 *
 * What has to match: HTTP status, JSON key order, value types (including
 * `Decimal` fields, which both ORMs serialise as strings), business dates,
 * error wording, the validation `details` array and the shape of every record.
 * What cannot match between two runs and is therefore masked: surrogate ids,
 * JWTs, the `createdAt` / `updatedAt` stamps of the capture and how many rows a
 * list happened to return (each capture ran against a database with a different
 * amount of leftover test data).
 *
 * Usage:
 *   1. npm run db:reset            # the demo data the baseline was taken from
 *   2. npm run dev                 # the API has to be running
 *   3. npm run test:parity         # (also part of npm test)
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CASES, WRITE_CASES, runAll, stamp } from './fixtures/api-cases.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.env.API_BASE_URL || 'http://127.0.0.1:5000';
const baseline = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'fixtures', 'api-baseline-prisma.json'), 'utf8'),
);

const keyFor = (id) => {
  const key = Object.keys(baseline).find((k) => k.startsWith(`${id} `));
  assert.ok(key, `the baseline file has no case "${id}"`);
  return key;
};

/** the baseline titles embed the ids of *that* database — show them masked */
const titleFor = (key) =>
  `${key.replace(/\/\d+(?=\/|\s|$)/g, '/:id')} — same response as Prisma`;

// --- masking ---------------------------------------------------------------

const TODAY = new Date().toISOString().slice(0, 10);
const ID_KEYS = /^(id|customerId|policyId|userId|reviewerId|claimId)$/;
const COUNT_KEYS = /^(total|totalPages)$/;

const normalize = (value, key) => {
  if (typeof value === 'string') {
    if (/^eyJ[\w-]+\.[\w-]+\.[\w-]+$/.test(value)) return '<token>';
    if (value.startsWith(TODAY)) return '<now>';
    return value.replace(/\d{13}/g, '<stamp>');
  }
  if (typeof value === 'number' && ID_KEYS.test(key ?? '')) return '<id>';
  if (typeof value === 'number' && COUNT_KEYS.test(key ?? '')) return '<count>';
  if (Array.isArray(value)) return value.map((item) => normalize(item));
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = normalize(v, k);
    return out;
  }
  return value;
};

// key order is part of the contract, so the compared form is the serialised one
const render = (value) => JSON.stringify(normalize(value));

/** rows of a list are matched by e-mail, because ids differ between runs */
const naturalKey = (item) =>
  item && typeof item === 'object' && typeof item.email === 'string' ? normalize(item.email) : null;

const notes = [];

const compare = (base, cur, where = '$') => {
  const problems = [];

  const walk = (x, y, p) => {
    if (render(x) === render(y)) return;

    if (Array.isArray(x) && Array.isArray(y)) {
      const kx = x.map(naturalKey);
      const ky = y.map(naturalKey);
      if (kx.length && ky.length && kx.every((k) => k !== null) && ky.every((k) => k !== null)) {
        // every baseline row has to come back unchanged
        for (let i = 0; i < x.length; i += 1) {
          if (String(kx[i]).includes('<stamp>')) continue; // created by that capture only
          const j = ky.indexOf(kx[i]);
          if (j === -1) {
            problems.push(`${p}[${i}] (${kx[i]}): this row is no longer returned`);
            continue;
          }
          walk(x[i], y[j], `${p}[${i}]`);
        }
        // rows only this run has (leftover data) may differ, but they still
        // have to be shaped exactly like every other row
        for (let j = 0; j < y.length; j += 1) {
          if (kx.includes(ky[j])) continue;
          const shape = Object.keys(x[0] ?? {}).sort().join(', ');
          const actual = Object.keys(y[j] ?? {}).sort().join(', ');
          if (shape && actual !== shape) {
            problems.push(`${p}[${j}] (${ky[j]}): fields [${actual}] instead of [${shape}]`);
          } else {
            notes.push(`${p}[${j}] (${ky[j]}) only exists in this run — its shape was checked`);
          }
        }
        return;
      }
      if (x.length !== y.length) {
        problems.push(`${p}: ${x.length} entries in the baseline, ${y.length} now`);
        return;
      }
      x.forEach((item, i) => walk(item, y[i], `${p}[${i}]`));
      return;
    }

    if (x && y && typeof x === 'object' && typeof y === 'object' && !Array.isArray(x)) {
      const kx = Object.keys(x);
      const ky = Object.keys(y);
      if (kx.join(',') !== ky.join(',')) {
        problems.push(`${p}: fields [${ky.join(', ')}] instead of [${kx.join(', ')}]`);
        return;
      }
      for (const k of kx) walk(x[k], y[k], `${p}.${k}`);
      return;
    }

    problems.push(`${p}: ${render(y)} instead of ${render(x)}`);
  };

  walk(base, cur, '');
  assert.deepEqual(
    problems,
    [],
    `${where} differs from the Prisma baseline:\n${problems.map((p) => ` - ${p}`).join('\n')}`,
  );
};

// --- the suite -------------------------------------------------------------

let actual = {};

before(async () => {
  const health = await fetch(`${BASE}/api/health`);
  assert.equal(health.status, 200, 'the API server must be running for the parity check');

  // runAll() logs in with the three demo roles, resolves the ids the paths need
  // and replays every case in capture order
  actual = (await runAll(BASE)).byId;
});

for (const [id] of CASES) {
  test(titleFor(keyFor(id)), async () => {
    compare(baseline[keyFor(id)], actual[id]);
  });
}

test(`${titleFor(keyFor(WRITE_CASES.id))} · ${titleFor(keyFor(WRITE_CASES.updateId))}`, async () => {
  compare(baseline[keyFor(WRITE_CASES.id)], actual[WRITE_CASES.id], '$.created');
  compare(baseline[keyFor(WRITE_CASES.updateId)], actual[WRITE_CASES.updateId], '$.updated');
});

after(async () => {
  // the register and create cases add rows — remove them again
  try {
    const [{ close, db }, { customers, users }, { eq }] = await Promise.all([
      import('../src/db/index.js'),
      import('../src/db/schema.js'),
      import('drizzle-orm'),
    ]);
    await db.delete(users).where(eq(users.email, `baseline.${stamp}@insure.test`));
    await db.delete(customers).where(eq(customers.email, `baseline.customer.${stamp}@insure.test`));
    await close();
  } catch {
    /* no direct database access from the test process — nothing to clean up */
  }
  if (notes.length) console.log(notes.map((n) => `  · ${n}`).join('\n'));
});
