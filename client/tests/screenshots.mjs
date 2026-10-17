/**
 * Screenshot + UI audit runner for the Insurance Management Platform.
 *
 * Walks every screen of the app with a real Chromium instance, waits until the
 * page is fully loaded (network idle, fonts ready, React settled) before every
 * capture, and stores the PNGs in docs/screenshots/.
 *
 * While it renders, it also runs an in-page audit that looks for the classic
 * visual defects: overlapping text, clipped/overflowing content, low colour
 * contrast and off-palette colours.
 *
 * Usage:
 *   npm run dev                 # in client/  (vite on :5173)
 *   npm run screenshots         # in client/
 *
 * Environment:
 *   APP_URL          base url of the running app   (default http://127.0.0.1:5173)
 *   CHROME_PATH      path to a Chromium/Chrome binary (optional)
 *   OUT_DIR          where the PNGs are written      (default ../docs/screenshots)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLIENT_ROOT = path.resolve(__dirname, '..');
const APP_URL = process.env.APP_URL || 'http://127.0.0.1:5173';
const OUT_DIR = path.resolve(process.env.OUT_DIR || path.join(CLIENT_ROOT, '..', 'docs', 'screenshots'));

const DESKTOP = { width: 1440, height: 900, deviceScaleFactor: 1 };
const MOBILE = { width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true };

// --- browser bootstrap -----------------------------------------------------

async function resolveBrowser() {
  const candidates = [];
  if (process.env.CHROME_PATH) candidates.push(process.env.CHROME_PATH);

  // puppeteer-core is a dependency; the browser binary may come from
  // @sparticuz/chromium (serverless) or a locally installed Chrome.
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
    'No Chromium binary found. Set CHROME_PATH to a Chrome/Chromium executable ' +
      '(or install @sparticuz/chromium).',
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
    '--force-device-scale-factor=1',
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

/** Waits until the page has no pending requests and no loading placeholders. */
async function waitForFullLoad(page, { timeout = 30000 } = {}) {
  await page.waitForNetworkIdle({ idleTime: 600, timeout }).catch(() => {});
  await page.evaluate(() => document.fonts?.ready).catch(() => {});
  await page
    .waitForFunction(
      () => {
        const text = document.body.innerText || '';
        return !/(^|\n)\s*(Loading…|Signing in…|Saving…)\s*(\n|$)/.test(text);
      },
      { timeout: 15000 },
    )
    .catch(() => {});
  // let transitions/animations finish
  await new Promise((r) => setTimeout(r, 400));
}

/** Clicks the first button whose visible text matches. */
async function clickButton(page, text) {
  const clicked = await page.evaluate((label) => {
    const btn = [...document.querySelectorAll('button')].find(
      (b) => b.textContent.trim() === label && b.offsetParent !== null,
    );
    if (!btn) return false;
    btn.click();
    return true;
  }, text);
  if (!clicked) throw new Error(`button not found: "${text}"`);
}

/** Fills an input without relying on the keyboard (works for date fields). */
async function setInput(page, selector, value, index = 0) {
  await page.evaluate(
    (sel, idx, val) => {
      const el = [...document.querySelectorAll(sel)][idx];
      if (!el) throw new Error('input not found: ' + sel);
      const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement : HTMLInputElement;
      const setter = Object.getOwnPropertyDescriptor(proto.prototype, 'value').set;
      setter.call(el, val);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    },
    selector,
    index,
    value,
  );
}

/** Removes any session left over from a previous scenario. */
async function clearSession(page) {
  await page.goto(`${APP_URL}/login`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
  });
}

async function login(page, email, password) {
  await page.goto(`${APP_URL}/login`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
  });
  await page.goto(`${APP_URL}/login`, { waitUntil: 'domcontentloaded' });
  await waitForFullLoad(page);
  await page.waitForSelector('input[type="email"]');
  await page.type('input[type="email"]', email, { delay: 12 });
  await page.type('input[type="password"]', password, { delay: 12 });
  await clickButton(page, 'Login');
  await page.waitForFunction(() => !location.pathname.startsWith('/login'), { timeout: 20000 }).catch(() => {});
  await waitForFullLoad(page);
}

/** Looks up a customer id through the API so the shots are not tied to ids. */
async function customerId(page, name) {
  const id = await page.evaluate(async (n) => {
    const token = localStorage.getItem('token');
    const res = await fetch(`/api/customers?search=${encodeURIComponent(n)}&limit=50`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    const found = (data.customers || []).find((c) => c.name === n);
    return found ? found.id : null;
  }, name);
  if (!id) throw new Error(`customer not found: ${name}`);
  return id;
}

// --- in-page UI audit ------------------------------------------------------

/* eslint-disable no-undef */
const AUDIT_SOURCE = `(() => {
  const issues = [];
  const cfg = window.__auditCfg || {};

  const isVisible = (el) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    if (r.width <= 2 || r.height <= 2) return false; // sr-only / visually hidden
    return s.visibility !== 'hidden' && s.display !== 'none' && s.opacity !== '0';
  };

  /** True when the element is the top-most thing painted at that point. */
  const isOnTop = (el, x, y) => {
    const stack = document.elementsFromPoint(x, y);
    if (!stack.length) return false;
    const top = stack[0];
    return top === el || el.contains(top) || top.contains(el);
  };

  /**
   * Full-screen fixed overlays (modal backdrops) legitimately cover the page
   * behind them — content underneath is not a visual clash.
   */
  const fixedOverlayAncestor = (el) => {
    let cur = el.parentElement;
    while (cur && cur !== document.body) {
      const s = getComputedStyle(cur);
      if (s.position === 'fixed') {
        const r = cur.getBoundingClientRect();
        if (r.width >= window.innerWidth - 2 && r.height >= window.innerHeight - 2) return cur;
      }
      cur = cur.parentElement;
    }
    return null;
  };

  const hasOwnText = (el) => {
    for (const n of el.childNodes) {
      if (n.nodeType === 3 && n.textContent.trim().length) return true;
    }
    return false;
  };

  const label = (el) => {
    const t = (el.innerText || el.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 60);
    return el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\\s+/).slice(0, 3).join('.') : '') + ' :: ' + t;
  };

  // ---------- 1. horizontal / vertical overflow ----------
  const doc = document.documentElement;
  if (doc.scrollWidth > window.innerWidth + 1) {
    issues.push({ type: 'page-overflow-x', severity: 'high', detail: 'document scrolls horizontally by ' + (doc.scrollWidth - window.innerWidth) + 'px' });
  }

  for (const el of document.querySelectorAll('*')) {
    if (!isVisible(el)) continue;
    const s = getComputedStyle(el);
    if (s.overflowX === 'auto' || s.overflowX === 'scroll' || s.overflow === 'auto' || s.overflow === 'scroll') continue;
    // an intentional ellipsis on plain text is not a defect
    if (s.textOverflow === 'ellipsis' && el.children.length === 0) continue;
    if (el.scrollWidth > el.clientWidth + 2 && el.clientWidth > 0 && hasOwnText(el)) {
      issues.push({
        type: 'clipped-text',
        severity: 'medium',
        detail: label(el) + ' — content ' + el.scrollWidth + 'px wider than its ' + el.clientWidth + 'px box',
      });
    }
  }

  // ---------- 2. overlapping text ----------
  const leaves = [...document.querySelectorAll('body *')].filter((el) => {
    if (!isVisible(el)) return false;
    if (!hasOwnText(el)) return false;
    const s = getComputedStyle(el);
    if (s.position === 'fixed' && el.getBoundingClientRect().width >= window.innerWidth - 2) return false; // backdrop
    return true;
  });

  for (let i = 0; i < leaves.length; i++) {
    const a = leaves[i];
    const ra = a.getBoundingClientRect();
    for (let j = i + 1; j < leaves.length; j++) {
      const b = leaves[j];
      if (a.contains(b) || b.contains(a)) continue;
      // one of them sits behind a modal backdrop -> not a visual clash
      const overlayA = fixedOverlayAncestor(a);
      const overlayB = fixedOverlayAncestor(b);
      if ((overlayA && !overlayA.contains(b)) || (overlayB && !overlayB.contains(a))) continue;
      const rb = b.getBoundingClientRect();
      const w = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left);
      const h = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
      if (w > 2 && h > 2) {
        const area = w * h;
        const minArea = Math.min(ra.width * ra.height, rb.width * rb.height);
        // both elements have to be painted at the same spot to be a real clash
        const cx = (Math.max(ra.left, rb.left) + Math.min(ra.right, rb.right)) / 2;
        const cy = (Math.max(ra.top, rb.top) + Math.min(ra.bottom, rb.bottom)) / 2;
        if (area > minArea * 0.12 && (isOnTop(a, cx, cy) || isOnTop(b, cx, cy))) {
          issues.push({
            type: 'overlap',
            severity: 'high',
            detail: label(a) + '  <>  ' + label(b) + '  (' + Math.round(w) + 'x' + Math.round(h) + 'px)',
          });
        }
      }
    }
  }

  // ---------- colour helpers ----------
  // Tailwind v4 emits oklch() colours, so every colour is painted on a 1x1
  // canvas and read back as RGB before it is compared.
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const parse = (value) => {
    if (!value) return null;
    const m = String(value).match(/rgba?\\(([^)]+)\\)/);
    if (m) {
      const p = m[1].split(/[,\\s/]+/).filter(Boolean).map(parseFloat);
      return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
    }
    const hex = String(value).match(/^#([0-9a-f]{3,8})$/i);
    if (hex) {
      let h = hex[1];
      if (h.length === 3) h = h.split('').map((c) => c + c).join('');
      const r = parseInt(h.slice(0, 2), 16);
      const g = parseInt(h.slice(2, 4), 16);
      const b = parseInt(h.slice(4, 6), 16);
      const a = h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1;
      return { r, g, b, a };
    }
    // oklch() / color(srgb …) / color-mix() / anything else the browser knows
    try {
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = String(value);
      ctx.fillRect(0, 0, 1, 1);
      const d = ctx.getImageData(0, 0, 1, 1).data;
      if (d[3] === 0 && String(value).toLowerCase() !== 'transparent') return null;
      return { r: d[0], g: d[1], b: d[2], a: d[3] / 255 };
    } catch {
      return null;
    }
  };

  // ---------- 3. colour contrast ----------
  if (cfg.contrast !== false) {
  const lum = ({ r, g, b }) => {
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const ratio = (a, b) => {
    const l1 = lum(a), l2 = lum(b);
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  };
  const bgOf = (el) => {
    let cur = el;
    while (cur && cur !== document.documentElement) {
      const c = parse(getComputedStyle(cur).backgroundColor);
      if (c && c.a > 0.95) return c;
      cur = cur.parentElement;
    }
    return { r: 255, g: 255, b: 255, a: 1 };
  };

  for (const el of leaves) {
    const s = getComputedStyle(el);
    const fg = parse(s.color);
    if (!fg) continue;
    const bg = bgOf(el);
    const size = parseFloat(s.fontSize);
    const bold = parseInt(s.fontWeight, 10) >= 700;
    const large = size >= 24 || (size >= 18.66 && bold);
    const need = large ? 3 : 4.5;
    const r = ratio(fg, bg);
    if (r < need) {
      issues.push({
        type: 'low-contrast',
        severity: r < need - 1 ? 'high' : 'medium',
        detail: label(el) + ' — ' + r.toFixed(2) + ':1 (needs ' + need + ':1) on ' + s.color + ' over rgb(' + Math.round(bg.r) + ',' + Math.round(bg.g) + ',' + Math.round(bg.b) + ')',
      });
    }
  }

  } // end contrast block

  // ---------- 4. off-palette colours ----------
  if (cfg.palette !== false) {
  // The design system is the Tailwind theme, so the allowed colours are read
  // straight from the --color-* custom properties of the root element.
  const palette = [];
  const rootStyle = getComputedStyle(document.documentElement);
  for (let i = 0; i < rootStyle.length; i++) {
    const prop = rootStyle[i];
    if (!prop.startsWith('--color-')) continue;
    const c = parse(rootStyle.getPropertyValue(prop).trim());
    if (c && c.a > 0.9) palette.push(c);
  }
  const inPalette = (c) =>
    palette.some(
      (p) => Math.abs(p.r - c.r) <= 3 && Math.abs(p.g - c.g) <= 3 && Math.abs(p.b - c.b) <= 3,
    );
  const seen = new Set();
  for (const el of leaves) {
    const s = getComputedStyle(el);
    for (const prop of ['color', 'backgroundColor', 'borderTopColor']) {
      const c = parse(s[prop]);
      if (!c || c.a < 0.05) continue;
      const key = Math.round(c.r) + ',' + Math.round(c.g) + ',' + Math.round(c.b);
      if (seen.has(key)) continue;
      seen.add(key);
      if (!inPalette(c)) {
        issues.push({
          type: 'off-palette',
          severity: 'low',
          detail:
            s[prop] +
            ' → rgb(' +
            Math.round(c.r) +
            ',' +
            Math.round(c.g) +
            ',' +
            Math.round(c.b) +
            ') on ' +
            label(el),
        });
      }
    }
  }

  } // end palette block

  // ---------- 5. tiny text ----------
  if (cfg.tinyText !== false) {
    for (const el of leaves) {
      const s = getComputedStyle(el);
      const size = parseFloat(s.fontSize);
      if (size < 10) {
        issues.push({ type: 'tiny-text', severity: 'low', detail: label(el) + ' — ' + size + 'px' });
      }
    }
  }

  return issues;
})()`;
/* eslint-enable no-undef */

async function audit(page, cfg = {}) {
  await page.evaluate((c) => {
    window.__auditCfg = c;
  }, cfg);
  return page.evaluate(AUDIT_SOURCE);
}

// --- scenarios -------------------------------------------------------------

const scenarios = [];
const shot = (name, opts = {}) => scenarios.push({ name, ...opts });

// Day 1 — requirement / wireframe deliverables
shot('day1-01-wireframes', {
  viewport: DESKTOP,
  fullPage: true,
  // the wireframe document is intentionally low-fi (9px labels) — the app
  // colour/contrast rules do not apply to it
  audit: { contrast: false, palette: false, tinyText: false },
  async run(page) {
    const file = path.resolve(CLIENT_ROOT, '..', 'docs', 'wireframes.html');
    await page.goto('file://' + file, { waitUntil: 'networkidle0' });
    await waitForFullLoad(page);
  },
});

// Day 2 — authentication
shot('day2-01-login', {
  viewport: DESKTOP,
  async run(page) {
    await clearSession(page);
    await page.goto(`${APP_URL}/login`, { waitUntil: 'domcontentloaded' });
    await waitForFullLoad(page);
  },
});

shot('day2-02-login-wrong-credentials', {
  viewport: DESKTOP,
  async run(page) {
    await clearSession(page);
    await page.goto(`${APP_URL}/login`, { waitUntil: 'domcontentloaded' });
    await waitForFullLoad(page);
    await page.type('input[type="email"]', 'admin@insure.test', { delay: 10 });
    await page.type('input[type="password"]', 'WrongPassword1', { delay: 10 });
    await clickButton(page, 'Login');
    await page.waitForSelector('.bg-red-50', { timeout: 15000 });
    await waitForFullLoad(page);
  },
});

shot('day2-03-login-empty-required-fields', {
  viewport: DESKTOP,
  async run(page) {
    await clearSession(page);
    await page.goto(`${APP_URL}/login`, { waitUntil: 'domcontentloaded' });
    await waitForFullLoad(page);
    await clickButton(page, 'Login');
    await new Promise((r) => setTimeout(r, 500));
  },
});

shot('day2-04-login-mobile', {
  viewport: MOBILE,
  async run(page) {
    await clearSession(page);
    await page.goto(`${APP_URL}/login`, { waitUntil: 'domcontentloaded' });
    await waitForFullLoad(page);
  },
});

shot('day2-05-create-account-form', {
  viewport: DESKTOP,
  async run(page) {
    await clearSession(page);
    await page.goto(`${APP_URL}/login`, { waitUntil: 'domcontentloaded' });
    await waitForFullLoad(page);
    await clickButton(page, 'Create an account');
    await page.waitForSelector('input[name="name"]', { timeout: 10000 });
    await waitForFullLoad(page);
  },
});

shot('day2-06-create-account-validation', {
  viewport: DESKTOP,
  async run(page) {
    await clearSession(page);
    await page.goto(`${APP_URL}/login`, { waitUntil: 'domcontentloaded' });
    await waitForFullLoad(page);
    await clickButton(page, 'Create an account');
    await page.waitForSelector('input[name="name"]', { timeout: 10000 });
    await setInput(page, 'input[name="name"]', 'Ravi Kumar');
    await setInput(page, 'input[name="email"]', `register.${Date.now()}@insure.test`);
    await setInput(page, 'input[name="password"]', 'abcdefghij'); // no number -> rejected
    await clickButton(page, 'Create account');
    await page.waitForSelector('[role="alert"]', { timeout: 15000 });
    await waitForFullLoad(page);
  },
});

shot('day2-07-create-account-success', {
  viewport: DESKTOP,
  async run(page) {
    await clearSession(page);
    await page.goto(`${APP_URL}/login`, { waitUntil: 'domcontentloaded' });
    await waitForFullLoad(page);
    await clickButton(page, 'Create an account');
    await page.waitForSelector('input[name="name"]', { timeout: 10000 });
    await setInput(page, 'input[name="name"]', 'Ravi Kumar');
    await setInput(page, 'input[name="email"]', `register.${Date.now()}@insure.test`);
    await setInput(page, 'input[name="password"]', 'Secret123');
    await clickButton(page, 'Create account');
    await page.waitForFunction(() => !location.pathname.startsWith('/login'), { timeout: 20000 }).catch(() => {});
    await waitForFullLoad(page);
  },
});

// Day 3 — customer management (admin)
shot('day3-01-customers-list', {
  viewport: DESKTOP,
  async run(page) {
    await login(page, 'admin@insure.test', 'Admin@123');
  },
});

shot('day3-02-customers-search', {
  viewport: DESKTOP,
  async run(page) {
    await login(page, 'admin@insure.test', 'Admin@123');
    await page.click('input[placeholder*="Search"]');
    await page.type('input[placeholder*="Search"]', 'nita', { delay: 25 });
    await new Promise((r) => setTimeout(r, 700));
    await waitForFullLoad(page);
  },
});

shot('day3-03-customers-search-no-results', {
  viewport: DESKTOP,
  async run(page) {
    await login(page, 'admin@insure.test', 'Admin@123');
    await page.click('input[placeholder*="Search"]');
    await page.type('input[placeholder*="Search"]', 'zzzz-nothing', { delay: 15 });
    await new Promise((r) => setTimeout(r, 700));
    await waitForFullLoad(page);
  },
});

shot('day3-04-register-customer-modal', {
  viewport: DESKTOP,
  async run(page) {
    await login(page, 'admin@insure.test', 'Admin@123');
    await clickButton(page, '+ Register customer');
    await page.waitForSelector('form input[name="dob"]', { timeout: 10000 });
    await waitForFullLoad(page);
  },
});

shot('day3-05-register-customer-validation', {
  viewport: DESKTOP,
  async run(page) {
    await login(page, 'admin@insure.test', 'Admin@123');
    await clickButton(page, '+ Register customer');
    await page.waitForSelector('form input[name="dob"]', { timeout: 10000 });
    // a syntactically valid e-mail (so the browser does not block the submit)
    // with invalid name / phone / address -> the server-side field errors show
    await setInput(page, 'form input[name="name"]', 'A');
    await setInput(page, 'form input[name="email"]', 'screenshot.validation@insure.test');
    await setInput(page, 'form input[name="phone"]', '123');
    await setInput(page, 'form input[name="address"]', 'no');
    await clickButton(page, 'Register');
    await page.waitForSelector('form .text-red-600', { timeout: 15000 });
    await waitForFullLoad(page);
  },
});

shot('day3-06-customer-detail', {
  viewport: DESKTOP,
  fullPage: true,
  async run(page) {
    await login(page, 'admin@insure.test', 'Admin@123');
    await page.goto(`${APP_URL}/customers/${await customerId(page, 'Nita Rao')}`, {
      waitUntil: 'domcontentloaded',
    });
    await waitForFullLoad(page);
  },
});

shot('day3-07-customer-detail-empty-history', {
  viewport: DESKTOP,
  fullPage: true,
  async run(page) {
    await login(page, 'admin@insure.test', 'Admin@123');
    await page.goto(`${APP_URL}/customers/${await customerId(page, 'Meera Iyer')}`, {
      waitUntil: 'domcontentloaded',
    });
    await waitForFullLoad(page);
  },
});

shot('day3-08-edit-customer-modal', {
  viewport: DESKTOP,
  async run(page) {
    await login(page, 'admin@insure.test', 'Admin@123');
    await clickButton(page, 'Edit');
    await page.waitForSelector('form input[name="dob"]', { timeout: 10000 });
    await waitForFullLoad(page);
  },
});

shot('day3-09-customer-own-profile', {
  viewport: DESKTOP,
  fullPage: true,
  async run(page) {
    await login(page, 'asha@insure.test', 'Asha@1234');
  },
});

shot('day3-10-customers-list-mobile', {
  viewport: MOBILE,
  fullPage: true,
  async run(page) {
    await login(page, 'admin@insure.test', 'Admin@123');
  },
});

shot('day3-11-customer-detail-mobile', {
  viewport: MOBILE,
  fullPage: true,
  async run(page) {
    await login(page, 'admin@insure.test', 'Admin@123');
    await page.goto(`${APP_URL}/customers/${await customerId(page, 'Nita Rao')}`, {
      waitUntil: 'domcontentloaded',
    });
    await waitForFullLoad(page);
  },
});

shot('day3-12-register-modal-mobile', {
  viewport: MOBILE,
  async run(page) {
    await login(page, 'admin@insure.test', 'Admin@123');
    await clickButton(page, '+ Register customer');
    await page.waitForSelector('form input[name="dob"]', { timeout: 10000 });
    await waitForFullLoad(page);
  },
});

shot('day3-13-unknown-route-redirect', {
  viewport: DESKTOP,
  async run(page) {
    await login(page, 'admin@insure.test', 'Admin@123');
    await page.goto(`${APP_URL}/no-such-page`, { waitUntil: 'domcontentloaded' });
    await waitForFullLoad(page);
  },
});

shot('day3-14-agent-view', {
  viewport: DESKTOP,
  async run(page) {
    await login(page, 'agent@insure.test', 'Agent@123');
  },
});



shot('day3-15-customer-created', {
  viewport: DESKTOP,
  async run(page) {
    await login(page, 'admin@insure.test', 'Admin@123');
    await clickButton(page, '+ Register customer');
    await page.waitForSelector('form input[name="dob"]', { timeout: 10000 });
    const email = `screenshot.${Date.now()}@insure.test`;
    await setInput(page, 'form input[name="name"]', 'Screenshot Customer');
    await setInput(page, 'form input[name="email"]', email);
    await setInput(page, 'form input[name="phone"]', '9812340099');
    await setInput(page, 'form input[name="dob"]', '1992-03-04');
    await setInput(page, 'form input[name="address"]', '12 Marine Drive, Goa');
    await clickButton(page, 'Register');
    await page.waitForFunction(() => !document.querySelector('form input[name="dob"]'), { timeout: 15000 });
    await waitForFullLoad(page);
  },
});

// --- runner ----------------------------------------------------------------

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  // remove screenshots of scenarios that no longer exist
  const expected = new Set(scenarios.map((s) => `${s.name}.png`));
  for (const file of fs.readdirSync(OUT_DIR)) {
    if (file.endsWith('.png') && !expected.has(file)) {
      fs.unlinkSync(path.join(OUT_DIR, file));
      console.log(`· removed stale screenshot ${file}`);
    }
  }

  const browser = await launch();
  const report = [];
  let failures = 0;

  for (const scenario of scenarios) {
    const page = await browser.newPage();
    const consoleErrors = [];
    const networkErrors = [];
    page.on('console', (m) => {
      if (m.type() !== 'error') return;
      // deliberate 4xx responses (login error, validation error) are part of
      // the scenario — they are not application defects
      if (/Failed to load resource/.test(m.text())) networkErrors.push(m.text());
      else consoleErrors.push(m.text());
    });
    page.on('pageerror', (e) => consoleErrors.push(String(e)));

    const entry = { name: scenario.name, issues: [], consoleErrors: [], networkErrors: [] };
    try {
      await page.setViewport(scenario.viewport || DESKTOP);
      await scenario.run(page);
      await waitForFullLoad(page);

      const issues = await audit(page, scenario.audit || {});
      entry.issues = issues;

      const file = path.join(OUT_DIR, `${scenario.name}.png`);
      await page.screenshot({ path: file, fullPage: Boolean(scenario.fullPage) });
      entry.file = path.relative(process.cwd(), file);
      entry.consoleErrors = consoleErrors;
      entry.networkErrors = networkErrors;
      console.log(
        `✔ ${scenario.name.padEnd(34)} ${issues.length ? '⚠ ' + issues.length + ' issue(s)' : 'clean'}` +
          (consoleErrors.length ? `  · ${consoleErrors.length} console error(s)` : ''),
      );
      for (const i of issues) console.log(`    - [${i.severity}] ${i.type}: ${i.detail}`);
      if (issues.some((i) => i.severity === 'high') || consoleErrors.length) failures++;
    } catch (err) {
      entry.error = err.message;
      failures++;
      console.log(`✖ ${scenario.name.padEnd(34)} ${err.message}`);
    } finally {
      report.push(entry);
      await page.close();
    }
  }

  await browser.close();

  fs.writeFileSync(path.join(OUT_DIR, 'ui-audit.json'), JSON.stringify(report, null, 2));
  const total = report.reduce((n, r) => n + r.issues.length, 0);
  console.log(`\n${report.length} screens captured → ${OUT_DIR}`);
  console.log(`${total} issue(s) found (${failures} screen(s) with high-severity issues)`);
  if (failures) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
