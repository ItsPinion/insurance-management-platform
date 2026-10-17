/**
 * The HTTP surface of the API as a list of requests.
 *
 * Both `tests/orm-parity.test.mjs` (compares the answers with the captured
 * baseline) and `tests/capture-responses.mjs` (writes a new baseline) use this
 * module, so the two can never drift apart.
 *
 * Each case is [id, method, path, options]:
 *   - `id`     the number the baseline file gives the response
 *   - `path`   `:nita` / `:own` are resolved from the demo data before a run
 *   - `options` `token` names a demo account (admin / agent / customer) or a
 *              literal bearer value; `body` is sent as JSON
 */
export const stamp = Date.now();

export const ADMIN = { email: 'admin@insure.test', password: 'Admin@123' };
export const AGENT = { email: 'agent@insure.test', password: 'Agent@123' };
export const CUSTOMER = { email: 'asha@insure.test', password: 'Asha@1234' };

export const CASES = [
  ['00', 'GET', '/api/health', {}],
  ['01', 'POST', '/api/auth/login', { body: { email: ADMIN.email, password: ADMIN.password } }],
  ['02', 'POST', '/api/auth/login', { body: { email: ADMIN.email, password: 'nope' } }],
  ['03', 'POST', '/api/auth/login', { body: { email: 'not-an-email', password: 'x' } }],
  ['04', 'GET', '/api/auth/me', { token: 'admin' }],
  ['05', 'GET', '/api/auth/me', { token: 'customer' }],
  ['06', 'GET', '/api/auth/me', {}],
  ['07', 'GET', '/api/auth/me', { token: 'garbage.token.value' }],
  ['08', 'GET', '/api/auth/users', { token: 'admin' }],
  ['09', 'GET', '/api/auth/users', { token: 'agent' }],
  ['10', 'GET', '/api/customers', { token: 'admin' }],
  ['11', 'GET', '/api/customers?search=ra&page=1&limit=2', { token: 'agent' }],
  ['12', 'GET', '/api/customers?search=zzzz', { token: 'admin' }],
  ['13', 'GET', '/api/customers?page=0', { token: 'admin' }],
  ['14', 'GET', '/api/customers?limit=999', { token: 'admin' }],
  ['15', 'GET', '/api/customers', { token: 'customer' }],
  ['16', 'GET', '/api/customers', {}],
  ['17', 'GET', '/api/customers/:nita', { token: 'admin' }],
  ['18', 'GET', '/api/customers/:nita', { token: 'customer' }],
  ['19', 'GET', '/api/customers/:own', { token: 'customer' }],
  ['20', 'GET', '/api/customers/999999', { token: 'admin' }],
  ['21', 'GET', '/api/customers/:nita/history', { token: 'admin' }],
  ['22', 'GET', '/api/customers/:nita/history', { token: 'customer' }],
  [
    '23',
    'POST',
    '/api/customers',
    { token: 'admin', body: { name: 'X', dob: '1990-01-01', phone: '123', address: 'no', email: 'bad' } },
  ],
  [
    '24',
    'POST',
    '/api/customers',
    {
      token: 'customer',
      body: { name: 'X', dob: '1990-01-01', phone: '123', address: 'no', email: 'bad' },
    },
  ],
  ['25', 'PUT', '/api/customers/:nita', { token: 'agent', body: { phone: '123' } }],
  [
    '26',
    'POST',
    '/api/auth/register',
    { body: { name: 'Baseline User', email: `baseline.${stamp}@insure.test`, password: 'Passw0rd1' } },
  ],
  ['27', 'POST', '/api/auth/register', { body: { name: 'X', email: 'bad', password: 'x' } }],
  ['28', 'GET', '/api/unknown-route', {}],
];

/**
 * Cases 29 and 30 write a record, so they run after the read-only ones. Their
 * ids in the baseline file are 90 (create) and 91 (the update that follows).
 */
export const WRITE_CASES = {
  id: '90',
  updateId: '91',
  create: {
    method: 'POST',
    path: '/api/customers',
    body: {
      name: 'Baseline Customer',
      dob: '1990-05-20',
      phone: '9812345678',
      address: '42 Baseline Street, Pune',
      email: `baseline.customer.${stamp}@insure.test`,
    },
  },
  update: { method: 'PUT', body: { phone: '9812345679' } },
};

export async function call(base, method, path, { token, body } = {}) {
  const res = await fetch(`${base}${path}`, {
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
  return { status: res.status, data };
}

/** log in with the three demo roles and resolve the ids the paths need */
export async function prepare(base) {
  const tokens = {};
  for (const [key, creds] of Object.entries({ admin: ADMIN, agent: AGENT, customer: CUSTOMER })) {
    const res = await call(base, 'POST', '/api/auth/login', { body: creds });
    if (res.status !== 200) {
      throw new Error(`the demo account ${creds.email} must exist (npm run db:reset)`);
    }
    tokens[key] = res.data.token;
  }

  const nita = (await call(base, 'GET', '/api/customers?search=Nita&limit=5', { token: tokens.admin }))
    .data.customers[0];
  if (!nita) throw new Error('the demo customer "Nita Rao" must exist (npm run db:reset)');
  const own = (await call(base, 'GET', '/api/auth/me', { token: tokens.customer })).data.user.customer.id;

  return { tokens, ids: { nita: nita.id, own } };
}

export const resolvePath = (template, ids) =>
  template.replace(':nita', ids.nita).replace(':own', ids.own);

export const resolveToken = (token, tokens) => (token ? (tokens[token] ?? token) : undefined);

/** every case of one run, in capture order */
export async function capture(base, { tokens, ids }) {
  const byId = {};
  const byLabel = {};
  const remember = (id, label, response) => {
    byId[id] = response;
    byLabel[label] = response;
  };

  for (const [id, method, template, opts] of CASES) {
    const who =
      opts.token === 'admin' ? 'admin' : opts.token === 'agent' ? 'agent'
        : opts.token === 'customer' ? 'customer' : opts.token ? 'badtoken' : 'anon';
    const path = resolvePath(template, ids);
    const response = await call(base, method, path, {
      ...opts,
      token: resolveToken(opts.token, tokens),
    });
    // the label is the key the baseline file uses; the id is what the test looks up
    remember(id, `${id} ${method} ${path} [${who}]`, response);
  }

  const created = await call(base, WRITE_CASES.create.method, WRITE_CASES.create.path, {
    token: tokens.admin,
    body: WRITE_CASES.create.body,
  });
  remember(
    WRITE_CASES.id,
    `${WRITE_CASES.id} ${WRITE_CASES.create.method} ${WRITE_CASES.create.path} (created)`,
    created,
  );

  if (created.data?.customer?.id) {
    const updated = await call(
      base,
      WRITE_CASES.update.method,
      `/api/customers/${created.data.customer.id}`,
      { token: tokens.admin, body: WRITE_CASES.update.body },
    );
    remember(
      WRITE_CASES.updateId,
      `${WRITE_CASES.updateId} ${WRITE_CASES.update.method} /api/customers/:id (updated)`,
      updated,
    );
  }

  return { byId, byLabel };
}

/** log in, resolve the demo ids and replay every case (the parity test and the
 * baseline capture both go through here) */
export async function runAll(base) {
  const prepared = await prepare(base);
  const { byId, byLabel } = await capture(base, prepared);
  return { byId, byLabel, ids: prepared.ids };
}
