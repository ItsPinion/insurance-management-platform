# Testing — Days 1 to 3 re-verification

**Date:** 2026-10-17 · **Scope:** Day 1 (requirements + wireframes), Day 2 (database +
authentication), Day 3 (customer management)

Everything below is repeatable from a clean checkout — no manual steps.

---

## 1. What was tested

| Layer | Tool | Location | Result |
|-------|------|----------|--------|
| API endpoints (47 assertions) | `node:test` + `fetch` | `server/tests/api.test.mjs` | 47/47 pass |
| UI screens (23 screens) | Puppeteer + Chromium | `client/tests/screenshots.mjs` | 23/23 captured, 0 UI issues |
| Static analysis | oxlint | `client/` | 0 errors |
| Production build | Vite | `client/` | builds clean |

Every endpoint of the running application was exercised — happy path *and* the
error paths (missing/invalid token, wrong role, invalid payload, duplicate
record, unknown id, unknown route).

---

## 2. API test suite

```bash
# 1. start the API (needs a migrated + seeded database)
cd server && npm run dev

# 2. run the suite against it
cd server && npm test
```

`server/tests/api.test.mjs` covers:

| Endpoint | Covered behaviour |
|----------|-------------------|
| `GET /api/health` | 200 + payload |
| `POST /api/auth/register` | 201 (CUSTOMER, no password in the response), 400 (name / e-mail / password rules), 409 (duplicate) |
| `POST /api/auth/login` | 200 (admin, agent, customer), case-insensitive e-mail, 401 (wrong password / unknown user), 400 (malformed e-mail) |
| `GET /api/auth/me` | 200 (user + linked customer), 401 (no token), 401 (tampered token) |
| `POST /api/auth/users` | 201 (admin creates an agent), 400 (invalid role), 403 (agent, customer) |
| `GET /api/auth/users` | 200 (admin list, no password hashes), 403 (agent) |
| `GET /api/customers` | 200 (admin, agent), 401 (anonymous), 403 (customer), search by name/e-mail/phone, empty result, pagination, 400 (limit > 100, page < 1) |
| `POST /api/customers` | 201, 400 (every field validated), 409 (duplicate e-mail), 403 (customer) |
| `GET /api/customers/:id` | 200 + counts, 404, 401, own profile for a customer, 403 for somebody else's profile |
| `PUT /api/customers/:id` | 200 (partial update), 400, 404, 403 (customer) |
| `GET /api/customers/:id/history` | 200 (policies + claims + payments + documents), 200 for the owning customer, 403 for another customer, 404 |
| unknown route | 404 JSON error |

The suite removes the rows it creates, so it can be run repeatedly.

---

## 3. Screenshot + UI audit runner

```bash
# terminal 1
cd server && npm run dev

# terminal 2
cd client && npm run dev

# terminal 3
cd client && npm run screenshots
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

## 4. Defects found by this run and fixed

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

---

## 5. Test data

`server/tests/reset-demo-data.mjs` restores a clean, reproducible demo state
(three accounts + five customers with policies, claims, payments and documents):

```bash
cd server && npm run db:reset
```

| Account | E-mail | Password | Role |
|---------|--------|----------|------|
| System Admin | `admin@insure.test` | `Admin@123` | ADMIN |
| Agent Smith | `agent@insure.test` | `Agent@123` | AGENT |
| Asha Verma | `asha@insure.test` | `Asha@1234` | CUSTOMER |

`npm run db:seed:demo` only re-seeds the demo customers (without touching the
accounts).

---

## 6. Screenshots

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
