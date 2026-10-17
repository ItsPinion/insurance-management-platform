# 🛡️ Insurance Management Platform

A full-stack web application for managing insurance operations — customers, policies,
claims, premium payments, documents, and business reports — with role-based access
for **Administrators**, **Insurance Agents**, and **Customers**.

> Internship project · 14-day build schedule

## Tech Stack

| Layer | Technology |
|---|---|
| Monorepo | Turborepo 2 + npm workspaces |
| Frontend | React.js + Tailwind CSS |
| Backend | Node.js + Express.js |
| Database | PostgreSQL + Prisma ORM |
| Auth | JWT + bcrypt |
| Uploads | Multer |
| Validation | Zod |
| Charts | Chart.js |
| PDF | PDFKit |
| Testing | node:test (API) · Puppeteer/Chromium (sign-in flow, screenshots + UI audit) |
| Hosting | Vercel (client) · Render (server) |

## Repository Structure

```
insurance-management-platform/        # Turborepo root
├── package.json              # npm workspaces + turbo scripts
├── turbo.json                # task graph (build, dev, test, lint, screenshots)
├── package-lock.json         # one lockfile for the whole monorepo
├── client/                   # workspace "client" — React frontend
│   ├── src/
│   │   ├── components/      # Layout (header, sidebar, mobile nav)
│   │   ├── context/         # AuthContext (JWT session), session helpers
│   │   ├── pages/           # Login, MyProfile, customers/*
│   │   └── api/             # axios client + auth interceptor
│   └── tests/               # login-flow.mjs (sign-in regression), screenshots.mjs
├── server/                   # workspace "insurance-server" — Express API
│   ├── prisma/            # schema.prisma, migrations, seed.js
│   ├── src/
│   │   ├── app.js         # Express app wiring
│   │   ├── index.js       # entrypoint
│   │   ├── lib/           # prisma client
│   │   ├── middleware/    # auth (JWT + roles), error handling
│   │   └── modules/       # auth/, customers/  (routes / controller / schemas)
│   └── tests/             # api.test.mjs, seed + reset scripts
└── docs/
    ├── requirements.md    # Requirement analysis (Day 1)
    ├── wireframes.html    # Low-fi UI wireframes (Day 1)
    ├── database.md        # ERD + design decisions (Day 2)
    ├── testing.md         # Test plan, defects found, fixes
    └── screenshots/       # Captured screens for Day 1 – Day 3
```

### Turborepo tasks

| Command | Runs |
|---|---|
| `npm run dev` | the API and the client together, in parallel |
| `npm run build` | the production build of the client |
| `npm run lint` | oxlint over the client |
| `npm test` | the API suite and the browser sign-in suite |
| `npm run screenshots` | 23 screens + the DOM audit → `docs/screenshots/` |
| `npm run db:reset` | the demo dataset (customers, policies, claims, payments) |

Every command can be narrowed to one workspace, e.g.
`npx turbo run test --filter=insurance-server` or
`npx turbo run dev --filter=client`.

## 14-Day Schedule

| Day | Tasks | Status |
|---|---|---|
| 1 | Requirement analysis, UI wireframes, Git setup | ✅ Done |
| 2 | Database design + authentication module | ✅ Done |
| 3 | Customer Management module | ✅ Done |
| 4 | Policy Management module | ⬜ |
| 5 | Premium Tracking module | ⬜ |
| 6 | Claim Management module | ⬜ |
| 7 | Document Upload module | ⬜ |
| 8 | Reports Dashboard with Chart.js | ⬜ |
| 9 | Search, Filters, Pagination | ⬜ |
| 10 | Role-Based Authorization | ⬜ |
| 11 | Validation & Error Handling | ⬜ |
| 12 | Testing & Bug Fixes | ⬜ |
| 13 | UI Improvements & Responsive Design | ⬜ |
| 14 | Deployment, Documentation, Presentation | ⬜ |

## Getting Started

```bash
# 1. install the whole monorepo (one command, one lockfile)
npm install

# 2. API setup (needs PostgreSQL)
cp server/.env.example server/.env    # fill in DATABASE_URL + JWT_SECRET
npm run prisma:migrate                 # create the schema
npm run db:seed                        # admin / agent / customer accounts

# 3. run the API and the client together
npm run dev                            # API :5000 · client :5173 (/api → :5000)
```

Prefer one package on its own? Use the workspace commands directly:
`npm run dev --workspace client` or `npm run dev --workspace insurance-server`.

### Demo accounts

| Role | E-mail | Password |
|---|---|---|
| ADMIN | `admin@insure.test` | `Admin@123` |
| AGENT | `agent@insure.test` | `Agent@123` |
| CUSTOMER | `asha@insure.test` | `Asha@1234` |

`npm run db:reset` (in `server/`) restores the demo dataset — customers with
policies, claims, payments and documents — for manual testing and screenshots.

## Testing

```bash
npm run dev            # terminal 1 — the app has to be running

npm test               # terminal 2 — 48 API assertions + 6 sign-in scenarios
npm run screenshots    # terminal 3 — 23 screens + DOM audit → docs/screenshots/
```

Both suites run through Turborepo, so a single workspace can be tested on its
own:

```bash
npx turbo run test --filter=insurance-server   # API only
npx turbo run test:login --filter=client       # browser only
```

The screenshot runner waits for the network to be idle, the fonts to be loaded
and the React tree to settle before every capture, and it flags overlapping
text, clipped content, low colour contrast and off-palette colours.

Details, coverage and the list of defects that were found and fixed are in
**[docs/testing.md](docs/testing.md)**.

## Deliverables

| Day | Deliverable |
|---|---|
| 1 | **[docs/requirements.md](docs/requirements.md)** — functional & non-functional requirements, permissions matrix, core workflow, data model, API surface, risks. |
| 1 | **[docs/wireframes.html](docs/wireframes.html)** — low-fidelity wireframes for the 8 key screens (open in any browser). |
| 2 | **[docs/database.md](docs/database.md)** — ERD, design decisions and the Prisma schema. |
| 2 | Authentication module — register, login, JWT middleware, role guards, admin user management. |
| 3 | Customer management module — list, search, pagination, create, edit, detail, history. |
| 1–3 | **[docs/screenshots](docs/screenshots/)** — every screen, captured from the running app. |
