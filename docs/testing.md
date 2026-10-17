# Testing — Days 1 to 3 re-verification

**Date:** 2026-10-17 · **Scope:** Day 1 (requirements + wireframes), Day 2 (database +
authentication), Day 3 (customer management)

Everything below is repeatable from a clean checkout — no manual steps.

---

## 1. What was tested

| Layer | Tool | Location | Result |
|-------|------|----------|--------|
| API endpoints (48 assertions) | `node:test` + `fetch` | `server/tests/api.test.mjs` | 48/48 pass |
| Database schema (7 checks) | `node:test` + Drizzle schema metadata | `server/tests/schema.test.mjs` | 7/7 pass |
| Response parity vs the Prisma implementation (31 responses) | `node:test` + `fetch` | `server/tests/orm-parity.test.mjs` | 30/30 tests, 31/31 responses identical |
| Sign-in flow (6 scenarios) | Puppeteer + Chromium | `client/tests/login-flow.mjs` | 6/6 pass |
| UI screens (23 screens) | Puppeteer + Chromium | `client/tests/screenshots.mjs` | 23/23 captured, 0 UI issues |
| Static analysis | oxlint | `client/` | 0 errors |
| Production build | Vite | `client/` | builds clean |

Every endpoint of the running application was exercised — happy path *and* the
error paths (missing/invalid token, wrong role, invalid payload, duplicate
record, unknown id, unknown route).

Every command runs through Turborepo, so the whole monorepo is driven from
the repository root (`npm run dev`, `npm test`, `npm run screenshots`) and a
single workspace can be run on its own with `--filter`.

---

## 2. Day 1 – Day 3 coverage matrix

Every requirement of the first three days, and where it is proved.

### Day 1 — requirements & wireframes

| Deliverable | Where | Verified by |
|---|---|---|
| Requirement analysis (FR-1 … FR-7, roles matrix, API surface) | `docs/requirements.md` | manual cross-check against the implementation and the API surface below |
| Low-fidelity wireframes (8 key screens) | `docs/wireframes.html` | `day1-01-wireframes.png` (rendered from the file) |

### Day 2 — database & authentication

| Requirement | Implementation | Automated check | Screen |
|---|---|---|---|
| Database schema (7 tables, 6 enums, FKs, indexes) | `server/src/db/schema.js` (Drizzle) + `server/drizzle/0000_init.sql` | `server/tests/schema.test.mjs` — 7 checks: tables, columns (type / precision / nullability / default), primary key, enums, indexes + unique indexes, foreign keys (incl. `ON DELETE` / `ON UPDATE`), migration journal vs `drizzle.__drizzle_migrations` | — |
| ERD & design decisions | `docs/database.md` | matches the live database (same drift check) | — |
| FR-1.1 register / login (bcrypt) | `POST /api/auth/register`, `POST /api/auth/login` | `api.test.mjs` — 201, 200, 409 duplicate, 400 validation, 401 wrong password | `day2-01`, `day2-02`, `day2-05`, `day2-06`, `day2-07` |
| FR-1.2 JWT + `Authorization: Bearer` | `signToken()` in the auth controller, `requireAuth` middleware | `api.test.mjs` — 401 without a token, 401 with a tampered token | — |
| FR-1.3 role guards (API **and** frontend) | `requireRole` middleware, `Protected` route in `App.jsx` | `api.test.mjs` — 403 for the wrong role on every guarded route | `day3-09` (customer sees only their own profile), `day3-14` (agent view) |
| FR-1.4 admin creates accounts, customers self-register | `POST/GET /api/auth/users` (ADMIN), `POST /api/auth/register` | `api.test.mjs` — 201 agent, 400 invalid role, 403 for agent/customer | `day2-05` – `day2-07` (registration UI) |
| Consistent JSON errors | `server/src/middleware/error.js` | `api.test.mjs` — every failure path returns `{ error }` | — |

### Day 3 — customer management

| Requirement | Implementation | Automated check | Screen |
|---|---|---|---|
| FR-2.1 register a customer | `POST /api/customers` + register dialog | `api.test.mjs` — 201, 400 per field, 409 duplicate e-mail, 403 customer | `day3-04`, `day3-05`, `day3-15` |
| FR-2.2 view / edit a profile | `GET/PUT /api/customers/:id` + detail & edit screens | `api.test.mjs` — 200, 400, 404, 403 | `day3-06`, `day3-08` |
| FR-2.3 search + paginated list | `GET /api/customers?search&page&limit` (case-insensitive name/e-mail, phone, newest first) | `api.test.mjs` — search by name/e-mail/phone, empty result, pagination, 400 on an invalid limit/page | `day3-01`, `day3-02`, `day3-03` |
| FR-2.4 customer history | `GET /api/customers/:id/history` (policies, claims, payments, documents) | `api.test.mjs` — 200, own profile for a customer, 403 for another customer, 404 | `day3-06`, `day3-07` |
| A customer only sees their own data | `getCustomer` / `customerHistory` compare the token with the record | `api.test.mjs` — 403 for somebody else's profile | `day3-09` |

---

## 3. API test suite

```bash
# 1. start the app (needs a migrated + seeded database)
npm run dev            # Turborepo runs the API and the client together

# 2. run the suite against it
npm test               # or: npx turbo run test --filter=insurance-server
```

`server/tests/api.test.mjs` covers the HTTP surface, and
`server/tests/schema.test.mjs` proves that the database really is the one
`src/db/schema.js` describes: it reads the Drizzle table objects
(`getTableConfig`) and compares them with `information_schema`, `pg_indexes`
and `pg_enum`, and finally re-hashes the files in `server/drizzle/` against
`drizzle.__drizzle_migrations`.

`server/tests/api.test.mjs` covers:

| Endpoint | Covered behaviour |
|----------|-------------------|
| `GET /api/health` | 200 + payload |
| `POST /api/auth/register` | 201 (CUSTOMER, no password in the response), 400 (name / e-mail / password rules), 409 (duplicate) |
| `POST /api/auth/login` | 200 (admin, agent, customer), case-insensitive e-mail, 401 (wrong password / unknown user), 400 (malformed e-mail) |
| `GET /api/auth/me` | 200 (user + linked customer), 401 (no token), 401 (tampered token), 401 (account deleted — the session is no longer valid) |
| `POST /api/auth/users` | 201 (admin creates an agent), 400 (invalid role), 403 (agent, customer) |
| `GET /api/auth/users` | 200 (admin list, no password hashes), 403 (agent) |
| `GET /api/customers` | 200 (admin, agent), 401 (anonymous), 403 (customer), search by name/e-mail/phone, empty result, pagination, 400 (limit > 100, page < 1) |
| `POST /api/customers` | 201, 400 (every field validated), 409 (duplicate e-mail), 403 (customer) |
| `GET /api/customers/:id` | 200 + counts, 404, 401, own profile for a customer, 403 for somebody else's profile |
| `PUT /api/customers/:id` | 200 (partial update), 400, 404, 403 (customer) |
| `GET /api/customers/:id/history` | 200 (policies + claims + payments + documents), 200 for the owning customer, 403 for another customer, 404 |
| unknown route | 404 JSON error |

The suite removes the rows it creates (through the same `pg` pool the API
uses), so the database is left exactly as it was found and the suite can be run
repeatedly without polluting the demo data. The demo state itself is restored
with `npm run db:reset`.

---

## 4. Screenshot + UI audit runner

```bash
# terminal 1
npm run dev            # API + client

# terminal 2
npm run screenshots
```

`client/tests/screenshots.mjs` drives a real Chromium (Puppeteer) through every
screen of the app and stores the PNGs in `docs/screenshots/`.

**Nothing is captured before the page is ready.** Before each shot the runner

1. waits for the network to be idle (`waitForNetworkIdle`, 600 ms quiet window),
2. waits for `document.fonts.ready`,
3. waits until no `Loading…` / `Signing in…` / `Saving…` placeholder is on screen,
4. waits 400 ms for transitions to settle,
5. re-runs the network-idle wait before capturing.

While the page is up, an in-page audit inspects the rendered DOM and reports:

| Check | What it catches |
|-------|-----------------|
| `overlap` | two visible text elements painted on top of each other (modal backdrops are ignored) |
| `clipped-text` | text wider than its box without a scroll container or an intentional ellipsis |
| `page-overflow-x` | the document scrolls sideways |
| `low-contrast` | text below the WCAG AA ratio (4.5:1 / 3:1 for large text) |
| `off-palette` | a colour that is not part of the Tailwind theme (`--color-*`) |
| `tiny-text` | font sizes below 10 px |
| console errors | React warnings or uncaught exceptions (expected 4xx responses are separated) |

Tailwind v4 emits `oklch()` colours, so every colour is normalised to RGB
through a 1×1 canvas before it is compared.

The result of the last run is written to `docs/screenshots/ui-audit.json`.

---

## 5. Sign-in flow tests

```bash
# terminal 1
npm run dev            # API + client

# terminal 2
npm run test:login
```

`client/tests/login-flow.mjs` drives a real Chromium through the sign-in paths
and watches the address bar, so a sign-in that ends up on the login screen
again fails the run.

| # | Scenario | Expected |
|---|----------|----------|
| 1 | ADMIN signs in | lands on `/customers`, the list is rendered, `/login` is never visited again |
| 2 | AGENT signs in | lands on `/customers` |
| 3 | CUSTOMER signs in | lands on `/my` → the linked customer profile (`/customers/:id`) |
| 4 | a stale session is in the browser | it is dropped, the login form is shown, the app does not redirect in a loop |
| 5 | a wrong password | the form stays, an error is shown, no redirect |
| 6 | a protected page is reloaded | the session survives — the user is not sent back to `/login` |

The runner fails when the address bar visits `/login` after a successful
sign-in, which is exactly the reported symptom.

---

## 6. Defects found by this run and fixed

| # | Area | Problem | Fix |
|---|------|---------|-----|
| 1 | `App.jsx` / `Login.jsx` | A customer logging in was redirected to `/my` — a route that did not exist. The wildcard route sent them to `/customers`, the role guard bounced them back to `/login`: **a customer could never log in.** | Added the `/my` route with a `MyProfile` screen that resolves the linked customer id from `/api/auth/me`; role-aware redirects in `App.jsx` |
| 2 | `Layout.jsx` | The sidebar and the page content shared one flex row. On phones the navigation was squeezed into a 200 px column, the content was pushed off-screen and the page scrolled sideways. | The row now stacks on small screens (`flex-col md:flex-row`), the sidebar is hidden below `md` and replaced by a compact navigation strip |
| 3 | `Layout.jsx` | The user name and the role badge shared one truncating element, so the badge was cut in half and overlapped the *Logout* button on small screens. | Name and badge are separate flex items (`truncate` + `shrink-0`), the button can no longer be pushed |
| 4 | `Layout.jsx` | Customers saw an empty 208 px sidebar. | The sidebar is only rendered when the role actually has navigation entries |
| 5 | `CustomerFormModal.jsx` | The dialog had no height limit — on a short screen the address field and the buttons were clipped. | `max-h-[90vh] overflow-y-auto` on the form, `items-start` on the overlay so it scrolls |
| 6 | `CustomerList.jsx` | The table forced a horizontal scroll of the whole page on phones. | The table scrolls inside its own container (`overflow-x-auto`), the page no longer overflows |
| 7 | `CustomerList.jsx` | A failed list request was swallowed — the screen silently stayed empty. | The error is shown in an alert banner |
| 8 | `CustomerDetail.jsx` | Long e-mail addresses and addresses overflowed their grid cell. | `break-words` + `min-w-0` on the grid items |
| 9 | `CustomerDetail.jsx` | Status pills were squeezed by flex, so the text escaped the pill background. | `shrink-0` on the pill |
| 10 | `CustomerDetail.jsx` | A customer saw a "← Customers" link that they are not allowed to follow. | The link is only rendered for `ADMIN` / `AGENT` |
| 11 | `CustomerDetail.jsx` | The error state was a bare red sentence on the page background. | A proper alert box (`role="alert"`) |
| 12 | `Login.jsx` | Secondary text used `text-slate-400` on the slate background — 4.35:1, below WCAG AA. | `text-slate-500` / `text-slate-600` |
| 13 | `Login.jsx` | The demo credentials and the subtitle were too low in contrast. | `text-slate-500` / `text-slate-600` |
| 14 | `Login.jsx` | A failed registration only showed "Validation failed" without the field messages. | The API `details` array is now listed inside the alert |
| 15 | `Login.jsx` | The API supports self-registration (FR-1.4) and the Day 1 wireframe shows "Create an account", but the UI had no registration form. | Added the registration mode (name / e-mail / password) with a friendly empty state for accounts without a customer profile yet |
| 16 | `index.css` | Text without an explicit colour fell back to the browser default black, which is not part of the slate design system. | `body { color: var(--color-slate-900) }` |
| 17 | all forms | The inputs had no `id`/`name`, so labels were not associated with their fields and the fields could not be addressed by tests. | `id` + `name` on every input, `<label htmlFor>` everywhere |
| 18 | `CustomerDetail.jsx` | The state was reset inside `useEffect` (React Compiler warning). | The loaded record keeps its id, so the loading state is derived during render |
| 19 | `api/client.js` | Every 401 wiped the session and did a **full page reload** to `/login` — one rejected request was enough to throw a freshly signed-in user back to the login screen. | The interceptor now hands the 401 to the auth context, which verifies the session once and only ends it when the token is really gone. The redirect is a soft router navigation, so no page reload and no lost form state |
| 20 | `AuthContext.jsx` | The session stored in the browser was trusted without being checked, so an expired or revoked token kept the app in a loop (login → home → 401 → login). | The stored session is validated against `/api/auth/me` on start-up; a session that is no longer valid is dropped and the login form is shown |
| 21 | `App.jsx` / `Login.jsx` | The route guards decided before the stored session had been validated, so a reload could send a signed-in user to `/login` while the session was still being checked. | The auth context exposes a `checking` state; the guards and the login screen show a loader until the session is known |
| 22 | `auth.controller.js` | `/api/auth/me` answered `404` when the account behind a valid token no longer existed (deleted account, reset database), so the client could not tell "session invalid" from "not found". | `401 — Session is no longer valid`, which the client treats as "sign out" |

---

## 7. ORM swap verification (Prisma → Drizzle)

The server was moved from Prisma to **Drizzle ORM** without changing a single
response. That claim is checked, not assumed:

* `server/tests/fixtures/api-baseline-prisma.json` holds the **31 responses**
  that the Prisma implementation produced — every endpoint, every role, every
  error path (401 / 403 / 400 with field details / 409 / 404), captured from
  the running server before the swap.
* `server/tests/fixtures/api-cases.mjs` is the single list of those requests,
  shared by both tools below, so they cannot drift apart.
* `server/tests/orm-parity.test.mjs` replays exactly those requests against the
  current (Drizzle) server and compares the answers, one test per response.
* `node server/tests/capture-responses.mjs <file>` records a new baseline the
  same way — it refuses to overwrite a checked-in fixture on purpose.

| Compared | How |
|---|---|
| HTTP status | exact |
| JSON **key order** | exact (the responses are compared as serialised JSON) |
| value types | exact — including `Decimal` fields, which both ORMs return as strings (`"24500"`) |
| business dates | exact — `dob`, `startDate`, `endDate`, `dueDate`, `submissionDate` must come back as the same instants |
| error wording, validation `details`, pagination shape | exact |
| surrogate ids, JWTs, `createdAt`/`updatedAt` of the capture run | masked — they cannot be equal between two runs by definition |
| list endpoints | the rows are aligned by e-mail and every row of the current run has to match its counterpart from the baseline |

```bash
npm run db:reset         # the demo data the baseline was captured against
npm run dev              # API + client
npm run test:parity      # just this check — it also runs as part of npm test
```

Result of the last run: **31/31 responses identical** (`0` differences over
status, key order, types, dates, decimals and error text). The same run also
re-verifies the schema: the Drizzle schema describes the exact same database as
the previous `schema.prisma` did — tables, columns, types, defaults, enums,
indexes, foreign keys and `ON DELETE` / `ON UPDATE` rules (`npm run db:push`
against the untouched Prisma database reported **no changes**, which is how the
swap was verified to be schema-neutral).

The suite is also self-checking: temporarily renaming one field in a
controller makes 4 of the 30 tests fail, so the comparison cannot pass by
accident.

The same suite was run against a **brand-new database**
(`createdb insurance_fresh` → `npm run db:migrate` → `npm run db:seed` →
`npm run db:seed:demo`, API on another port) and everything passed there too —
85/85 — which is the proof that the Drizzle migrations alone are enough to
build the whole schema from scratch.

Totals for `npm test`: **85 server assertions** (48 API + 7 schema drift +
30 parity) and **6 browser sign-in scenarios**.

---

## 8. Test data

`server/tests/reset-demo-data.mjs` restores a clean, reproducible demo state
(three accounts + five customers with policies, claims, payments and documents):

```bash
npm run db:reset          # or: npm run db:reset --workspace insurance-server
```

| Account | E-mail | Password | Role |
|---------|--------|----------|------|
| System Admin | `admin@insure.test` | `Admin@123` | ADMIN |
| Agent Smith | `agent@insure.test` | `Agent@123` | AGENT |
| Asha Verma | `asha@insure.test` | `Asha@1234` | CUSTOMER |

`npm run db:seed:demo` only re-seeds the demo customers (without touching the
accounts).

---

## 9. Screenshots

| File | Screen |
|------|--------|
| `day1-01-wireframes.png` | Day 1 wireframes document (8 screens) |
| `day2-01-login.png` | Login screen |
| `day2-02-login-wrong-credentials.png` | Login with a wrong password |
| `day2-03-login-empty-required-fields.png` | Native validation on an empty submit |
| `day2-04-login-mobile.png` | Login on a phone |
| `day2-05-create-account-form.png` | Self-registration form (FR-1.4) |
| `day2-06-create-account-validation.png` | Registration with a rejected password |
| `day2-07-create-account-success.png` | Registered account without a customer profile yet |
| `day3-01-customers-list.png` | Customer list (admin) |
| `day3-02-customers-search.png` | Search by name |
| `day3-03-customers-search-no-results.png` | Search without a match |
| `day3-04-register-customer-modal.png` | Register-customer dialog |
| `day3-05-register-customer-validation.png` | Server-side field errors in the dialog |
| `day3-06-customer-detail.png` | Customer detail with policies, claims, payments, documents |
| `day3-07-customer-detail-empty-history.png` | Customer detail without history |
| `day3-08-edit-customer-modal.png` | Edit-customer dialog |
| `day3-09-customer-own-profile.png` | A customer on their own profile |
| `day3-10-customers-list-mobile.png` | Customer list on a phone |
| `day3-11-customer-detail-mobile.png` | Customer detail on a phone |
| `day3-12-register-modal-mobile.png` | Register-customer dialog on a phone |
| `day3-13-unknown-route-redirect.png` | Unknown route → customer list |
| `day3-14-agent-view.png` | Customer list as an agent |
| `day3-15-customer-created.png` | The list right after creating a customer |
