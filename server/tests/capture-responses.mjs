/**
 * Captures every response of the running API into a baseline file, so a later
 * implementation can be checked against it case by case
 * (`tests/orm-parity.test.mjs` does exactly that with the file in
 * `tests/fixtures/`).
 *
 * Usage:  node tests/capture-responses.mjs <outfile.json>
 *
 * The checked-in baseline (server/tests/fixtures/api-baseline-prisma.json) is
 * never overwritten on purpose — pass an explicit target, e.g.
 *   npm run db:reset
 *   node tests/capture-responses.mjs /tmp/api-baseline-drizzle.json
 */
import fs from 'node:fs';
import { runAll } from './fixtures/api-cases.mjs';

const BASE = process.env.API_BASE_URL || 'http://127.0.0.1:5000';
const OUT = process.argv[2];

if (!OUT) {
  console.error('usage: node tests/capture-responses.mjs <outfile.json>');
  process.exit(1);
}
if (OUT.includes(`${'fixtures'}${'/'}`)) {
  console.error('refusing to overwrite a checked-in fixture — choose a path outside tests/fixtures/');
  process.exit(1);
}

const health = await fetch(`${BASE}/api/health`).catch(() => null);
if (!health || health.status !== 200) {
  console.error(`the API has to be running at ${BASE} (npm run dev)`);
  process.exit(1);
}

const { byLabel } = await runAll(BASE);
const count = Object.keys(byLabel).length;
fs.writeFileSync(OUT, `${JSON.stringify(byLabel, null, 2)}\n`);
console.log(`captured ${count} responses → ${OUT}`);
