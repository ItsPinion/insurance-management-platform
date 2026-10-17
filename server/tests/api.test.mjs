/**
 * End-to-end API tests for the Insurance Management Platform (Day 2 auth +
 * Day 3 customer modules).
 *
 * Usage:
 *   1. Start the API:  npm run dev          (in server/)
 *   2. Run the tests:  npm test             (in server/)
 *
 * The suite talks to a live server over HTTP, so it validates the real
 * routing / validation / authorization stack (not mocked units).
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

const BASE = process.env.API_BASE_URL || 'http://127.0.0.1:5000';

// --- helpers ---------------------------------------------------------------

async function api(method, path, { token, body, raw } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  return raw ? { res, data } : { status: res.status, data };
}

const stamp = Date.now();
const ADMIN = { email: 'admin@insure.test', password: 'Admin@123' };
const AGENT = { email: 'agent@insure.test', password: 'Agent@123' };
const CUSTOMER = { email: 'asha@insure.test', password: 'Asha@1234' };

const tokens = {};
const ids = {};

// --- suite -----------------------------------------------------------------

before(async () => {
  const health = await api('GET', '/api/health');
  assert.equal(health.status, 200, 'API server must be running before the tests');

  for (const [key, creds] of Object.entries({ admin: ADMIN, agent: AGENT, customer: CUSTOMER })) {
    const { status, data } = await api('POST', '/api/auth/login', { body: creds });
    assert.equal(status, 200, `seed login failed for ${key}`);
    tokens[key] = data.token;
  }

  // A fresh customer to exercise the self-registration flow.
  const email = `test.user.${stamp}@insure.test`;
  const { status, data } = await api('POST', '/api/auth/register', {
    body: { name: 'Test User', email, password: 'Passw0rd1' },
  });
  assert.equal(status, 201, 'self-registration must succeed');
  ids.registeredUser = data.user.id;

  // A fresh customer profile (owned by an admin) for the customer-management flow.
  const customerEmail = `test.customer.${stamp}@insure.test`;
  const created = await api('POST', '/api/customers', {
    token: tokens.admin,
    body: {
      name: 'Test Customer',
      dob: '1990-05-20',
      phone: '9812345678',
      address: '42 Test Street, Pune',
      email: customerEmail,
    },
  });
  assert.equal(created.status, 201, 'customer creation must succeed');
  ids.customer = created.data.customer.id;
  ids.customerEmail = customerEmail;
});

after(async () => {
  // Best-effort cleanup of the records this run created. The API has no
  // delete endpoint yet (Day 3 scope), so the rows are removed directly;
  // if the database is not reachable from the test process the demo data can
  // be restored with `npm run db:reset`.
  try {
    const [{ db, pool }, { customers, users }, { ilike, or }] = await Promise.all([
      import('../src/db/index.js'),
      import('../src/db/schema.js'),
      import('drizzle-orm'),
    ]);
    await db
      .delete(users)
      .where(
        or(
          ilike(users.email, 'test.user.%'),
          ilike(users.email, 'register.%'),
          ilike(users.email, 'new.agent.%'),
          ilike(users.email, 'bad.role.%'),
          ilike(users.email, 'sneaky%'),
          ilike(users.email, 'nonumber.%'),
          ilike(users.email, 'baseline.%'),
        ),
      );
    await db
      .delete(customers)
      .where(
        or(
          ilike(customers.email, 'test.customer.%'),
          ilike(customers.email, 'created.%'),
          ilike(customers.email, 'baseline.customer.%'),
        ),
      );
    await pool.end();
  } catch {
    /* no direct database access from the test process — nothing to clean up */
  }
});

// --- health ----------------------------------------------------------------

test('GET /api/health returns ok', async () => {
  const { status, data } = await api('GET', '/api/health');
  assert.equal(status, 200);
  assert.equal(data.status, 'ok');
});

// --- auth: register --------------------------------------------------------

test('POST /api/auth/register creates a CUSTOMER account', async () => {
  const email = `register.${stamp}@insure.test`;
  const { status, data } = await api('POST', '/api/auth/register', {
    body: { name: 'Ravi Kumar', email, password: 'Secret123' },
  });
  assert.equal(status, 201);
  assert.ok(data.token, 'a JWT must be returned');
  assert.equal(data.user.role, 'CUSTOMER');
  assert.equal(data.user.email, email.toLowerCase());
  assert.equal(data.user.password, undefined, 'the password hash must never be returned');
});

test('POST /api/auth/register rejects invalid input with field details', async () => {
  const { status, data } = await api('POST', '/api/auth/register', {
    body: { name: 'A', email: 'not-an-email', password: 'short' },
  });
  assert.equal(status, 400);
  assert.equal(data.error, 'Validation failed');
  const fields = data.details.map((d) => d.field);
  assert.ok(fields.includes('name'), 'name error expected');
  assert.ok(fields.includes('email'), 'email error expected');
  assert.ok(fields.includes('password'), 'password error expected');
});

test('POST /api/auth/register rejects a password without a number', async () => {
  const { status, data } = await api('POST', '/api/auth/register', {
    body: { name: 'No Number', email: `nonumber.${stamp}@insure.test`, password: 'abcdefghij' },
  });
  assert.equal(status, 400);
  assert.ok(data.details.some((d) => d.field === 'password'));
});

test('POST /api/auth/register rejects a duplicate email with 409', async () => {
  const { status, data } = await api('POST', '/api/auth/register', {
    body: { name: 'Dupe', email: `register.${stamp}@insure.test`, password: 'Secret123' },
  });
  assert.equal(status, 409);
  assert.match(data.error, /already exists/i);
});

// --- auth: login -----------------------------------------------------------

test('POST /api/auth/login accepts valid credentials', async () => {
  const { status, data } = await api('POST', '/api/auth/login', { body: ADMIN });
  assert.equal(status, 200);
  assert.ok(data.token);
  assert.equal(data.user.role, 'ADMIN');
  assert.equal(data.user.password, undefined);
});

test('POST /api/auth/login is case-insensitive for the email', async () => {
  const { status } = await api('POST', '/api/auth/login', {
    body: { email: 'Admin@INSURE.test', password: ADMIN.password },
  });
  assert.equal(status, 200);
});

test('POST /api/auth/login rejects a wrong password with 401', async () => {
  const { status, data } = await api('POST', '/api/auth/login', {
    body: { email: ADMIN.email, password: 'WrongPass1' },
  });
  assert.equal(status, 401);
  assert.match(data.error, /invalid email or password/i);
});

test('POST /api/auth/login rejects an unknown email with 401', async () => {
  const { status } = await api('POST', '/api/auth/login', {
    body: { email: 'nobody@insure.test', password: 'Whatever1' },
  });
  assert.equal(status, 401);
});

test('POST /api/auth/login rejects a malformed email with 400', async () => {
  const { status, data } = await api('POST', '/api/auth/login', {
    body: { email: 'nope', password: 'Whatever1' },
  });
  assert.equal(status, 400);
  assert.equal(data.error, 'Validation failed');
});

// --- auth: me --------------------------------------------------------------

test('GET /api/auth/me returns the current user', async () => {
  const { status, data } = await api('GET', '/api/auth/me', { token: tokens.admin });
  assert.equal(status, 200);
  assert.equal(data.user.email, ADMIN.email);
  assert.equal(data.user.role, 'ADMIN');
  assert.equal(data.user.password, undefined);
});

test('GET /api/auth/me links a customer user to its customer profile', async () => {
  const { status, data } = await api('GET', '/api/auth/me', { token: tokens.customer });
  assert.equal(status, 200);
  assert.equal(data.user.role, 'CUSTOMER');
  assert.ok(data.user.customer?.id, 'the seeded customer must be linked to a profile');
});

test('GET /api/auth/me without a token returns 401', async () => {
  const { status, data } = await api('GET', '/api/auth/me');
  assert.equal(status, 401);
  assert.match(data.error, /authentication required/i);
});

test('GET /api/auth/me with a tampered token returns 401', async () => {
  const { status } = await api('GET', '/api/auth/me', { token: 'not.a.real.token' });
  assert.equal(status, 401);
});

test('GET /api/auth/me rejects a session whose account no longer exists', async () => {
  // A token that is signed correctly but points at a deleted account (the row
  // was removed or the database was reset) must not keep the session alive.
  const { default: jwt } = await import('jsonwebtoken');
  const { default: dotenv } = await import('dotenv');
  dotenv.config({ quiet: true });
  const token = jwt.sign(
    { id: 999999, role: 'ADMIN', name: 'Ghost User' },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
  const { status, data } = await api('GET', '/api/auth/me', { token });
  assert.equal(status, 401);
  assert.match(data.error, /no longer valid/i);
});

// --- auth: admin user management -------------------------------------------

test('POST /api/auth/users lets an ADMIN create an agent', async () => {
  const email = `new.agent.${stamp}@insure.test`;
  const { status, data } = await api('POST', '/api/auth/users', {
    token: tokens.admin,
    body: { name: 'New Agent', email, password: 'Agent@123', role: 'AGENT' },
  });
  assert.equal(status, 201);
  assert.equal(data.user.role, 'AGENT');
  assert.equal(data.user.password, undefined);
  ids.newAgent = data.user.id;
});

test('POST /api/auth/users rejects an unknown role with 400', async () => {
  const { status, data } = await api('POST', '/api/auth/users', {
    token: tokens.admin,
    body: { name: 'Bad Role', email: `bad.role.${stamp}@insure.test`, password: 'Agent@123', role: 'SUPERUSER' },
  });
  assert.equal(status, 400);
  assert.equal(data.error, 'Validation failed');
});

test('POST /api/auth/users is forbidden for an AGENT', async () => {
  const { status, data } = await api('POST', '/api/auth/users', {
    token: tokens.agent,
    body: { name: 'Sneaky', email: `sneaky.${stamp}@insure.test`, password: 'Agent@123', role: 'ADMIN' },
  });
  assert.equal(status, 403);
  assert.match(data.error, /permission/i);
});

test('POST /api/auth/users is forbidden for a CUSTOMER', async () => {
  const { status } = await api('POST', '/api/auth/users', {
    token: tokens.customer,
    body: { name: 'Sneaky', email: `sneaky2.${stamp}@insure.test`, password: 'Agent@123', role: 'ADMIN' },
  });
  assert.equal(status, 403);
});

test('GET /api/auth/users lists users for an ADMIN', async () => {
  const { status, data } = await api('GET', '/api/auth/users', { token: tokens.admin });
  assert.equal(status, 200);
  assert.ok(Array.isArray(data.users));
  assert.ok(data.users.length >= 3);
  assert.ok(data.users.every((u) => u.password === undefined));
  assert.ok(data.users.some((u) => u.email === ADMIN.email));
});

test('GET /api/auth/users is forbidden for an AGENT', async () => {
  const { status } = await api('GET', '/api/auth/users', { token: tokens.agent });
  assert.equal(status, 403);
});

// --- customers: list -------------------------------------------------------

test('GET /api/customers returns a paginated list for an ADMIN', async () => {
  const { status, data } = await api('GET', '/api/customers', { token: tokens.admin });
  assert.equal(status, 200);
  assert.ok(Array.isArray(data.customers));
  assert.equal(typeof data.pagination.total, 'number');
  assert.equal(data.pagination.page, 1);
  assert.equal(data.pagination.limit, 10);
  assert.equal(data.pagination.totalPages, Math.max(1, Math.ceil(data.pagination.total / 10)));
  assert.ok(data.customers.every((c) => c._count && typeof c._count.policies === 'number'));
});

test('GET /api/customers is allowed for an AGENT', async () => {
  const { status } = await api('GET', '/api/customers', { token: tokens.agent });
  assert.equal(status, 200);
});

test('GET /api/customers requires authentication', async () => {
  const { status, data } = await api('GET', '/api/customers');
  assert.equal(status, 401);
  assert.match(data.error, /authentication required/i);
});

test('GET /api/customers is forbidden for a CUSTOMER', async () => {
  const { status, data } = await api('GET', '/api/customers', { token: tokens.customer });
  assert.equal(status, 403);
  assert.match(data.error, /permission/i);
});

test('GET /api/customers filters by name, email and phone', async () => {
  const byName = await api('GET', `/api/customers?search=${encodeURIComponent('Test Customer')}`, {
    token: tokens.admin,
  });
  assert.equal(byName.status, 200);
  assert.ok(byName.data.customers.length >= 1);
  assert.ok(byName.data.customers.every((c) => /test customer/i.test(c.name)));

  const byEmail = await api('GET', `/api/customers?search=${encodeURIComponent(ids.customerEmail)}`, {
    token: tokens.admin,
  });
  assert.equal(byEmail.status, 200);
  assert.equal(byEmail.data.customers.length, 1);

  const byPhone = await api('GET', '/api/customers?search=9812345678', { token: tokens.admin });
  assert.equal(byPhone.status, 200);
  assert.ok(byPhone.data.customers.some((c) => c.phone === '9812345678'));
});

test('GET /api/customers returns an empty page for a search with no match', async () => {
  const { status, data } = await api('GET', '/api/customers?search=zzzz-no-such-customer', {
    token: tokens.admin,
  });
  assert.equal(status, 200);
  assert.deepEqual(data.customers, []);
  assert.equal(data.pagination.total, 0);
});

test('GET /api/customers honours page and limit', async () => {
  const { status, data } = await api('GET', '/api/customers?page=2&limit=2', { token: tokens.admin });
  assert.equal(status, 200);
  assert.equal(data.pagination.page, 2);
  assert.equal(data.pagination.limit, 2);
  assert.ok(data.customers.length <= 2);
});

test('GET /api/customers rejects a limit above 100', async () => {
  const { status, data } = await api('GET', '/api/customers?limit=500', { token: tokens.admin });
  assert.equal(status, 400);
  assert.equal(data.error, 'Validation failed');
});

test('GET /api/customers rejects a page below 1', async () => {
  const { status } = await api('GET', '/api/customers?page=0', { token: tokens.admin });
  assert.equal(status, 400);
});

// --- customers: create -----------------------------------------------------

test('POST /api/customers creates a customer profile', async () => {
  const email = `created.${stamp}@insure.test`;
  const { status, data } = await api('POST', '/api/customers', {
    token: tokens.agent,
    body: { name: 'Kavita Rao', dob: '1988-02-11', phone: '+91 98765 43210', address: '7 Park Lane, Mumbai', email },
  });
  assert.equal(status, 201);
  assert.equal(data.customer.email, email);
  assert.equal(data.customer.name, 'Kavita Rao');
  assert.equal(data.customer.userId, null);
  ids.created = data.customer.id;
});

test('POST /api/customers rejects invalid fields with details', async () => {
  const { status, data } = await api('POST', '/api/customers', {
    token: tokens.admin,
    body: { name: 'X', dob: '2999-01-01', phone: 'abc', address: 'no', email: 'bad-email' },
  });
  assert.equal(status, 400);
  assert.equal(data.error, 'Validation failed');
  const fields = data.details.map((d) => d.field);
  for (const f of ['name', 'dob', 'phone', 'address', 'email']) {
    assert.ok(fields.includes(f), `expected an error for ${f}`);
  }
});

test('POST /api/customers rejects a duplicate email with 409', async () => {
  const { status, data } = await api('POST', '/api/customers', {
    token: tokens.admin,
    body: {
      name: 'Duplicate',
      dob: '1990-01-01',
      phone: '9812345678',
      address: '42 Test Street, Pune',
      email: ids.customerEmail,
    },
  });
  assert.equal(status, 409);
  assert.match(data.error, /already exists/i);
});

test('POST /api/customers is forbidden for a CUSTOMER', async () => {
  const { status } = await api('POST', '/api/customers', {
    token: tokens.customer,
    body: { name: 'Nope', dob: '1990-01-01', phone: '9812345678', address: '42 Test Street, Pune', email: `nope.${stamp}@insure.test` },
  });
  assert.equal(status, 403);
});

// --- customers: read -------------------------------------------------------

test('GET /api/customers/:id returns one customer with counts', async () => {
  const { status, data } = await api('GET', `/api/customers/${ids.customer}`, { token: tokens.admin });
  assert.equal(status, 200);
  assert.equal(data.customer.id, ids.customer);
  assert.ok(data.customer._count);
  assert.ok('policies' in data.customer._count);
  assert.ok('documents' in data.customer._count);
});

test('GET /api/customers/:id returns 404 for an unknown id', async () => {
  const { status, data } = await api('GET', '/api/customers/999999', { token: tokens.admin });
  assert.equal(status, 404);
  assert.match(data.error, /not found/i);
});

test('GET /api/customers/:id requires authentication', async () => {
  const { status } = await api('GET', `/api/customers/${ids.customer}`);
  assert.equal(status, 401);
});

test('GET /api/customers/:id lets a CUSTOMER read its own profile', async () => {
  const { status, data } = await api('GET', '/api/auth/me', { token: tokens.customer });
  const ownId = data.user.customer.id;
  const { status: ownStatus } = await api('GET', `/api/customers/${ownId}`, { token: tokens.customer });
  assert.equal(ownStatus, 200);
});

test('GET /api/customers/:id forbids a CUSTOMER reading somebody else', async () => {
  const { status, data } = await api('GET', `/api/customers/${ids.customer}`, { token: tokens.customer });
  assert.equal(status, 403);
  assert.match(data.error, /own profile/i);
});

// --- customers: update -----------------------------------------------------

test('PUT /api/customers/:id updates a customer', async () => {
  const { status, data } = await api('PUT', `/api/customers/${ids.customer}`, {
    token: tokens.admin,
    body: { phone: '9822004455', address: '99 Updated Road, Pune' },
  });
  assert.equal(status, 200);
  assert.equal(data.customer.phone, '9822004455');
  assert.equal(data.customer.address, '99 Updated Road, Pune');
  assert.equal(data.customer.name, 'Test Customer', 'untouched fields must stay');
});

test('PUT /api/customers/:id rejects invalid values with details', async () => {
  const { status, data } = await api('PUT', `/api/customers/${ids.customer}`, {
    token: tokens.admin,
    body: { phone: 'not-a-phone' },
  });
  assert.equal(status, 400);
  assert.equal(data.error, 'Validation failed');
  assert.equal(data.details[0].field, 'phone');
});

test('PUT /api/customers/:id returns 404 for an unknown id', async () => {
  const { status } = await api('PUT', '/api/customers/999999', {
    token: tokens.admin,
    body: { name: 'Ghost' },
  });
  assert.equal(status, 404);
});

test('PUT /api/customers/:id is forbidden for a CUSTOMER', async () => {
  const { status } = await api('PUT', `/api/customers/${ids.customer}`, {
    token: tokens.customer,
    body: { name: 'Hacked' },
  });
  assert.equal(status, 403);
});

// --- customers: history ----------------------------------------------------

test('GET /api/customers/:id/history returns policies, claims, payments and documents', async () => {
  const { status, data } = await api('GET', `/api/customers/${ids.customer}/history`, {
    token: tokens.admin,
  });
  assert.equal(status, 200);
  assert.equal(data.customer.id, ids.customer);
  assert.ok(Array.isArray(data.customer.policies));
  assert.ok(Array.isArray(data.customer.documents));
  for (const policy of data.customer.policies) {
    assert.ok(Array.isArray(policy.claims));
    assert.ok(Array.isArray(policy.payments));
  }
});

test('GET /api/customers/:id/history is allowed for the owning CUSTOMER', async () => {
  const me = await api('GET', '/api/auth/me', { token: tokens.customer });
  const ownId = me.data.user.customer.id;
  const { status } = await api('GET', `/api/customers/${ownId}/history`, { token: tokens.customer });
  assert.equal(status, 200);
});

test('GET /api/customers/:id/history is forbidden for another CUSTOMER', async () => {
  const { status } = await api('GET', `/api/customers/${ids.customer}/history`, {
    token: tokens.customer,
  });
  assert.equal(status, 403);
});

test('GET /api/customers/:id/history returns 404 for an unknown id', async () => {
  const { status } = await api('GET', '/api/customers/999999/history', { token: tokens.admin });
  assert.equal(status, 404);
});

// --- misc ------------------------------------------------------------------

test('an unknown route returns a JSON 404', async () => {
  const { status, data } = await api('GET', '/api/does-not-exist', { token: tokens.admin });
  assert.equal(status, 404);
  assert.match(data.error, /route not found/i);
});
