/**
 * Login flow regression test for the Insurance Management Platform.
 *
 * The reported bug: signing in sent the user straight back to the login
 * screen. This runner drives a real Chromium instance through every sign-in
 * path and asserts that a successful login lands on the right page and never
 * returns to /login afterwards.
 *
 * Covered:
 *   1. ADMIN   logs in  → /customers
 *   2. AGENT   logs in  → /customers
 *   3. CUSTOMER logs in → /my → /customers/:id
 *   4. a stale session in the browser is dropped instead of looping
 *   5. a wrong password keeps the user on the login form with an error
 *   6. reloading a protected page keeps the session (no bounce to /login)
 *
 * Usage:
 *   npm run dev                 # in client/  (vite on :5173)
 *   npm run test:login          # in client/
 *
 * Environment:
 *   APP_URL     base url of the running app (default http://127.0.0.1:5173)
 *   CHROME_PATH path to a Chromium/Chrome binary (optional)
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_URL = process.env.APP_URL || 'http://127.0.0.1:5173';

const DESKTOP = { width: 1440, height: 900, deviceScaleFactor: 1 };

// --- browser bootstrap -----------------------------------------------------

async function resolveBrowser() {
  const candidates = [];
  if (process.env.CHROME_PATH) candidates.push(process.env.CHROME_PATH);

  try {
    const { default: chromium } = await import('@sparticuz/chromium');
    candidates.push(await chromium.executablePath());
  } catch {
    /* not installed — fall through */
  }

  candidates.push(
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  );

  const { existsSync } = await import('node:fs');
  for (const c of candidates) {
    if (c && existsSync(c)) return c;
  }
  throw new Error(
    'No Chromium binary found. Set CHROME_PATH to a Chrome/Chromium executable.',
  );
}

async function launch() {
  const { default: puppeteer } = await import('puppeteer-core');
  const executablePath = await resolveBrowser();
  const args = [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--hide-scrollbars',
  ];
  try {
    const { default: chromium } = await import('@sparticuz/chromium');
    args.push(...chromium.args.filter((a) => !a.startsWith('--single-process')));
  } catch {
    /* optional */
  }
  return puppeteer.launch({ executablePath, headless: true, args, defaultViewport: DESKTOP });
}

// --- page helpers ----------------------------------------------------------

async function waitForFullLoad(page, { timeout = 30000 } = {}) {
  await page.waitForNetworkIdle({ idleTime: 600, timeout }).catch(() => {});
  await page.evaluate(() => document.fonts?.ready).catch(() => {});
  await page
    .waitForFunction(() => !document.body.innerText.includes('Loading…'), { timeout: 10000 })
    .catch(() => {});
  await new Promise((r) => setTimeout(r, 300));
}

async function clickButton(page, text) {
  const handle = await page.evaluateHandle((label) => {
    const buttons = [...document.querySelectorAll('button')];
    return buttons.find((b) => b.textContent.trim() === label && !b.disabled) || null;
  }, text);
  const element = handle.asElement();
  if (!element) throw new Error(`button not found: ${text}`);
  await element.click();
}

async function setInput(page, selector, value) {
  await page.waitForSelector(selector, { timeout: 15000 });
  await page.click(selector, { clickCount: 3 });
  await page.type(selector, value, { delay: 12 });
}

async function signIn(page, email, password) {
  await page.goto(`${APP_URL}/login`, { waitUntil: 'domcontentloaded' });
  await waitForFullLoad(page);
  await setInput(page, 'input[type="email"]', email);
  await setInput(page, 'input[type="password"]', password);
  await clickButton(page, 'Login');
}

/** Watches the address bar for a while and reports every path it visits. */
async function watchPaths(page, ms = 3000) {
  const seen = [];
  const started = Date.now();
  let last = page.url();
  seen.push(new URL(last).pathname);
  while (Date.now() - started < ms) {
    await new Promise((r) => setTimeout(r, 100));
    const now = page.url();
    if (now !== last) {
      last = now;
      seen.push(new URL(now).pathname);
    }
  }
  return seen;
}

// --- test harness ----------------------------------------------------------

const results = [];

async function test(name, fn) {
  const browser = await launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  try {
    await fn(page);
    results.push({ name, ok: true });
    console.log(`  ok  ${name}`);
  } catch (err) {
    results.push({ name, ok: false, error: err.message });
    console.log(`FAIL  ${name}\n      ${err.message}`);
  } finally {
    if (errors.length) console.log(`      page errors: ${errors.join(' | ')}`);
    await browser.close();
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

// --- the scenarios ---------------------------------------------------------

console.log(`login flow tests against ${APP_URL}\n`);

await test('ADMIN signs in and lands on the customer list', async (page) => {
  await signIn(page, 'admin@insure.test', 'Admin@123');
  await page.waitForFunction(() => !location.pathname.startsWith('/login'), { timeout: 20000 });
  await waitForFullLoad(page);

  const paths = await watchPaths(page);
  assert(
    !paths.some((p) => p.startsWith('/login')),
    `the user was sent back to the login page: ${paths.join(' → ')}`,
  );
  assert(
    new URL(page.url()).pathname === '/customers',
    `expected /customers, got ${new URL(page.url()).pathname}`,
  );
  const text = await page.evaluate(() => document.body.innerText);
  assert(/customers/i.test(text), 'the customer list did not render');
});

await test('AGENT signs in and lands on the customer list', async (page) => {
  await signIn(page, 'agent@insure.test', 'Agent@123');
  await page.waitForFunction(() => !location.pathname.startsWith('/login'), { timeout: 20000 });
  await waitForFullLoad(page);

  const paths = await watchPaths(page);
  assert(
    !paths.some((p) => p.startsWith('/login')),
    `the user was sent back to the login page: ${paths.join(' → ')}`,
  );
  assert(
    new URL(page.url()).pathname === '/customers',
    `expected /customers, got ${new URL(page.url()).pathname}`,
  );
});

await test('CUSTOMER signs in and lands on their own profile', async (page) => {
  await signIn(page, 'asha@insure.test', 'Asha@1234');
  await page.waitForFunction(() => !location.pathname.startsWith('/login'), { timeout: 20000 });
  await waitForFullLoad(page);

  const paths = await watchPaths(page);
  assert(
    !paths.some((p) => p.startsWith('/login')),
    `the user was sent back to the login page: ${paths.join(' → ')}`,
  );
  const current = new URL(page.url()).pathname;
  assert(
    /^\/customers\/\d+$/.test(current),
    `expected the linked customer profile, got ${current} (paths: ${paths.join(' → ')})`,
  );
  const text = await page.evaluate(() => document.body.innerText);
  assert(/asha/i.test(text), 'the customer profile did not render');
});

await test('a stale session is dropped instead of looping on the login page', async (page) => {
  await page.goto(`${APP_URL}/login`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    localStorage.setItem('token', 'stale.token.value');
    localStorage.setItem(
      'user',
      JSON.stringify({ id: 1, name: 'Stale User', email: 'stale@insure.test', role: 'CUSTOMER' }),
    );
  });
  await page.goto(`${APP_URL}/login`, { waitUntil: 'domcontentloaded' });
  await waitForFullLoad(page);

  const paths = await watchPaths(page, 4000);
  const unique = [...new Set(paths)];
  assert(
    unique.length === 1,
    `the app redirected in a loop: ${paths.join(' → ')}`,
  );
  assert(
    await page.$('input[type="email"]'),
    'the login form is not shown after the stale session was dropped',
  );
  const stored = await page.evaluate(() => ({
    token: localStorage.getItem('token'),
    user: localStorage.getItem('user'),
  }));
  assert(!stored.token, 'the stale token was not removed');
  assert(!stored.user, 'the stale user was not removed');
});

await test('a wrong password keeps the user on the login form', async (page) => {
  await signIn(page, 'admin@insure.test', 'wrong-password');
  await page.waitForSelector('[role="alert"]', { timeout: 15000 });
  await waitForFullLoad(page);

  const current = new URL(page.url()).pathname;
  assert(current === '/login', `expected to stay on /login, got ${current}`);
  const text = await page.evaluate(() => document.body.innerText);
  assert(/invalid|failed/i.test(text), 'no error message was shown');
  assert(await page.$('input[type="email"]'), 'the login form disappeared');
});

await test('reloading a protected page keeps the session', async (page) => {
  await signIn(page, 'admin@insure.test', 'Admin@123');
  await page.waitForFunction(() => !location.pathname.startsWith('/login'), { timeout: 20000 });
  await waitForFullLoad(page);

  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitForFullLoad(page);

  const paths = await watchPaths(page, 3000);
  assert(
    !paths.some((p) => p.startsWith('/login')),
    `the session was lost on reload: ${paths.join(' → ')}`,
  );
  assert(
    new URL(page.url()).pathname === '/customers',
    `expected /customers after the reload, got ${new URL(page.url()).pathname}`,
  );
});

// --- summary ---------------------------------------------------------------

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} login flow tests passed`);
if (failed.length) {
  console.log('\nfailed:');
  for (const f of failed) console.log(`  - ${f.name}: ${f.error}`);
  process.exit(1);
}
