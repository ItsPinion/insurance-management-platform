# Database Design — Day 2 Deliverable

Neon-hosted PostgreSQL · Drizzle ORM (`drizzle-orm` 0.45 + `drizzle-kit`) ·
`@neondatabase/serverless` 1.2 · migration `drizzle/0000_init`

The schema lives in code: `server/src/db/schema.js` declares the seven tables,
the six enums, the indexes and the relations, and `drizzle-kit generate` turns
that declaration into the SQL migrations in `server/drizzle/`. There is no
generated client and no query engine to download — the API speaks the database's
own protocol, over Neon's HTTP/S gateway.

## Entity-Relationship Diagram

```
┌──────────┐ 1        0..1 ┌────────────┐
│   User   ├───────────────┤  Customer  │   (CUSTOMER users link to a profile;
│──────────│               │────────────│    agents may register customers
│ id       │               │ id         │    without a login yet → userId null)
│ name     │               │ name       │
│ email  ∪ │               │ dob        │
│ password │               │ phone      │
│ role     │               │ address    │
└────┬─────┘               │ email    ∪ │
     │ reviewer            └─┬────────┬─┘
     │ 0..1                  │ 1      │ 1
     │                       │        │
     │                  * ┌──┴─────┐  │ *
     │        ┌───────────┤ Policy │  │     ┌──────────────┐
     │        │           │────────│  └─────┤   Document   │
     │        │           │ id     │        │──────────────│
     │        │           │ number∪│        │ id, fileName │
     │        │           │ type   │        │ filePath     │
     │        │           │premium │        │ mimeType     │
     │        │           │ dates  │        │ docType      │
     │        │           │ status │        │ claimId 0..1 ├──┐
     │        │           └─┬────┬─┘        └──────────────┘  │
     │        │        *    │    │    *                       │
     │   ┌────┴────┐        │    │   ┌────────────────┐       │
     │   │  Claim  ├────────┘    └───┤ PremiumPayment │       │
     │   │─────────│ 1               │────────────────│       │
     └───┤ id      │                 │ id, amount     │       │
      *  │ number ∪│                 │ dueDate        │       │
         │ amount  │                 │ paymentDate?   │       │
         │ reason  │                 │ paymentStatus  │       │
         │ status  │ 1             * └────────────────┘       │
         └─────────┴──────────────────────────────────────────┘
                              documents attached to claims
```

`∪` = unique constraint

## Enums

| Enum | Values |
|---|---|
| `Role` | ADMIN · AGENT · CUSTOMER |
| `PolicyType` | HEALTH · LIFE · VEHICLE · HOME · TRAVEL |
| `PolicyStatus` | ACTIVE · EXPIRED · CANCELLED |
| `ClaimStatus` | SUBMITTED → UNDER_REVIEW → APPROVED / REJECTED |
| `PaymentStatus` | PAID · PENDING · OVERDUE |
| `DocumentType` | IDENTITY · POLICY · CLAIM · OTHER |

## Design decisions

1. **User ≠ Customer.** `User` is a login account; `Customer` is an insured person's
   profile. Agents can register customers who don't have logins yet (`userId` nullable).
2. **Money as `Decimal(12,2)`**, never floats — avoids rounding errors.
3. **Claims carry review metadata** (`reviewerId`, `reviewRemarks`, `reviewedAt`)
   so every decision has an audit trail (FR-4.4, FR-4.5).
4. **Payments track `dueDate` separately from `paymentDate`** — overdue detection is
   `dueDate < now AND status != PAID` (FR-5.2, FR-5.4).
5. **Documents link to a customer always, to a claim optionally** (FR-6, FR-4.2).
6. **Indexes** on all foreign keys + hot filters (`status`, `endDate`, `dueDate`,
   customer `name`/`phone`) for Day 9's search/filter/pagination.
7. **`createdAt` and `updatedAt` are written by the application**, never by a
   database default, so the pair always describes the same instant. The demo
   seed gives every row the next millisecond, which — together with the
   `id` tiebreaker in `ORDER BY createdAt DESC, id DESC` — makes the customer
   list and the history timeline deterministic instead of "whatever order the
   planner happened to pick" for rows written in the same millisecond.

## Setup — Neon

There is no database to install. In the [Neon console](https://console.neon.tech):
create a project (any region, PostgreSQL 16/17 is fine), then copy
**Project → Connection details → Pooled connection** and paste it into
`server/.env`:

```env
DATABASE_URL="postgresql://USER:PASSWORD@ep-XXXX-pooler.<region>.aws.neon.tech/neondb?sslmode=require"
JWT_SECRET="<at least 32 random characters>"
```

Then, from the repository root:

```bash
npm run db:ping       # preflight: endpoint, latency, TimeZone, row counts
npm run db:migrate    # creates the schema in Neon (server/drizzle/*.sql)
npm run db:seed       # the three demo accounts
npm run db:reset      # optional: the full demo dataset
npm run dev           # API on :5000, client on :5173
```

`npm run db:ping` (`server/scripts/check-db.js`) is the first thing to run when a
connection does not work: it reports the masked URL, the gateway the driver will
post to, the round-trip, the server's `TimeZone`, the tables with their row counts
and the migration state, and exits non-zero with a specific hint (DNS failure,
refused connection, reset by a firewall, wrong password, missing database …).

Three details worth knowing:

* **Use the pooled string** (`…-pooler…`, port 5432). The direct endpoint has no
  pooler and is meant for `psql` from a fixed host. The app itself keeps no
  connections open at all: each request is one HTTPS call to Neon's SQL gateway, so
  there is no pool to size and no socket to leak.
* **Keep `?sslmode=require`.** It is what turns TLS on for `drizzle-kit`, which
  opens its own wire-protocol socket; `server/drizzle.config.js` appends it if a
  pasted URL left it out.
* **Leave the project's `TimeZone` at UTC.** `defaultNow()` on the naive
  `timestamp(3)` columns is evaluated by the server, and the app reads those values
  back as UTC instants.

## Migration workflow

| Command | Does |
|---|---|
| `npm run db:generate` | diffs `src/db/schema.js` against the last snapshot in `drizzle/meta/` and writes `drizzle/NNNN_*.sql` |
| `npm run db:migrate` | applies every migration in the journal that is not in `drizzle.__drizzle_migrations` yet |
| `npm run db:push` | applies the schema straight to the database (fast local iteration, no migration file) |
| `npm run db:studio` | Drizzle Studio — browse and edit the tables in the browser |
| `npm run db:seed` | the three base accounts + the linked demo customer profile |
| `npm run db:reset` | wipe, reseed the accounts and the demo dataset (used by the test and screenshot runs) |

`drizzle.__drizzle_migrations` (schema `drizzle`, created by `db:migrate`) is
the migration history; the schema test asserts that its hashes match the files
in `drizzle/`, so an edited or unapplied migration fails the suite.

```js
// server/src/db/schema.js — the source of truth
export const customers = pgTable(
  'Customer',
  {
    id: serial('id').primaryKey(),
    name: text('name').notNull(),
    dob: ts('dob').notNull(),
    email: text('email').notNull(),
    userId: integer('userId'),
    /* … */
  },
  (t) => [
    uniqueIndex('Customer_email_key').on(t.email),
    foreignKey({ name: 'Customer_userId_fkey', columns: [t.userId], foreignColumns: [users.id] })
      .onUpdate('cascade')
      .onDelete('set null'),
  ],
);
```

Table and column names keep the original quoted camelCase spelling
(`"Customer"`, `"premiumAmount"`), so the swap of ORM did not touch a single
byte of the existing database.

## Connection

One module configures the database — `server/src/db/index.js` — and the API, the
seed scripts and the test suites all import it. It exposes a Drizzle client plus
four helpers (`query`, `execute`, `ping`, `close`) that hide the driver, so no
route or script opens a connection of its own:

```js
const sql = neon(DATABASE_URL);                 // statements are HTTPS requests
export const db = drizzle(sql, { schema });     // typed by ./schema.js
export const target = { host, database, endpoint };   // for the boot banner and `db:ping`
```

* **One driver, one target.** There is no `DB_DRIVER` switch, no pool to size and
  no local-cluster fallback: `drizzle-orm/neon-http` against Neon's SQL gateway. A
  request is one `POST`, so the API holds no sockets open, survives a Neon
  scale-to-wake, and runs unchanged on a serverless runtime.
* **A wrong URL is a boot failure, not a 500.** The module checks that
  `DATABASE_URL` names a Neon endpoint (`*.neon.tech` / `*.neon.ai` / an `ep-…`
  host) and otherwise throws with the console instructions in the message.
  `close()` is a documented no-op, because there is nothing to release.
* **No engine, no codegen.** The earlier Prisma setup needed a query-engine
  binary; when it could not be downloaded the WASM engine refused to start
  without a driver adapter, which is what `npm run dev` tripped over. Drizzle
  queries the driver directly, so the API boots with nothing but `DATABASE_URL`.
* **Why the app never uses `db.transaction()`, `PREPARE` or a session `SET`** —
  none of them exist over Neon's HTTP gateway, and nothing in this API needs them:
  every endpoint is a single statement or an idempotent pair, and the constraint
  rules live in the schema.
* **Time zones.** The timestamp columns are `timestamp(3)` without a time zone (as
  in the original design) and the API hands out `Date` objects; Drizzle writes and
  reads them as UTC text, so a date of birth written as
  `1990-04-12T00:00:00.000Z` comes back as exactly that instant whatever time zone
  the process runs in. `npm run db:ping` warns if the project's `TimeZone` is not
  `UTC`, because `defaultNow()` on those columns is evaluated by the server.
* **Aggregates and decimals are mapped per column.** `numeric(12,2)` stays a string
  (`"24500"`), and `count()` is parsed to a number, so `pagination.total` is a JSON
  number.
* **`updatedAt` is written by the application**, together with `createdAt`, the
  way Prisma's `@updatedAt` used to — the columns deliberately have no
  database default.
* **Errors** are mapped from SQLSTATE instead of Prisma error codes: `23505`
  (unique violation) → `409`, `23503` (foreign key) → `409`. Drizzle wraps
  driver failures in a `DrizzleQueryError`, so `error.js` unwraps `.cause`
  before looking at the code — which works here because Neon's gateway answers
  HTTP 400 with the same `code` field on `NeonDbError`.
* **`NEON_FETCH_ENDPOINT`** points the HTTP driver at a different gateway: the
  knob for a deployment that reaches Neon through its own proxy, and the way to
  rehearse this exact protocol without a route to Neon. The SQL, the types and the
  responses are unchanged; with it set, the host in `DATABASE_URL` is never
  dialled, so the check above is skipped.

### Upgrading a database that Prisma created

The Drizzle schema was written to match the old `schema.prisma` column for
column, so an existing database does not need to be rebuilt — but
`drizzle/__drizzle_migrations` does not know about the Prisma migration
history. Pick one:

* `npm run db:push` — compares the schema with the database and applies only
  the difference (nothing, if nothing changed). Do this, then mark the initial
  migration as applied so `db:migrate` stays a no-op:

  ```sql
  DROP TABLE IF EXISTS "_prisma_migrations";
  CREATE SCHEMA IF NOT EXISTS drizzle;
  CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
    id serial PRIMARY KEY, hash text NOT NULL, created_at bigint);
  -- <hash> = sha256 of the migration file, <when> = the journal's `when`
  INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
  SELECT '<hash>', '<when>'
   WHERE NOT EXISTS (SELECT 1 FROM drizzle.__drizzle_migrations);
  ```

  ```bash
  # the two values, from server/:
  node -e "const c=require('crypto'),f=require('fs');
    console.log(c.createHash('sha256').update(f.readFileSync('drizzle/0000_init.sql','utf8')).digest('hex'))"
  node -e "console.log(require('./drizzle/meta/_journal.json').entries[0].when)"
  ```

* or start clean: `dropdb`/`createdb` the database and run
  `npm run db:migrate && npm run db:seed && npm run db:seed:demo` — that path is
  what the CI-style check described in [testing.md](testing.md) exercises.

Either way `npm test` afterwards: the last schema check compares the hashes in
`drizzle/__drizzle_migrations` with the files in `server/drizzle/`, so a missing
or edited migration fails loudly.

## Schema verification

`server/tests/schema.test.mjs` reads the *live* Drizzle schema objects (nothing
is re-parsed from a text file) and compares them with the connected database:
every table exists, every column has the right type / precision / nullability
/ default, the primary key is `id`, every enum has the same values in the same
order, every index and unique index exists with the same columns, every foreign
key points at the right table, column and `ON DELETE` / `ON UPDATE` rule, and
the applied migrations match `drizzle/meta/_journal.json`. It runs as part of
`npm test`, so a migration that was never applied fails the suite instead of
surfacing later as a runtime error. The same checks pass whether the API was
pointed at Neon (see `docs/testing.md` §10).

```bash
npm test                              # API suite + schema check
npm run test:schema --workspace insurance-server   # the schema check alone
```

## Seeded demo accounts

| Role | Email | Password |
|---|---|---|
| ADMIN | admin@insure.test | Admin@123 |
| AGENT | agent@insure.test | Agent@123 |
| CUSTOMER | asha@insure.test | Asha@1234 |

## Auth API (implemented today)

| Method | Endpoint | Access | Description |
|---|---|---|---|
| POST | `/api/auth/register` | public | Customer self-registration → JWT |
| POST | `/api/auth/login` | public | Login → JWT (1-day expiry) |
| GET | `/api/auth/me` | any authenticated | Current user from token |
| POST | `/api/auth/users` | ADMIN | Create agent/admin accounts |
| GET | `/api/auth/users` | ADMIN | List all users |

Verified by manual tests: register ✅ · login ✅ · role guard 403 ✅ ·
bad credentials 401 ✅ · Zod validation 400 ✅ · missing token 401 ✅
