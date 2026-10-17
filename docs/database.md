# Database Design — Day 2 Deliverable

PostgreSQL · Drizzle ORM (`drizzle-orm` 0.45 + `drizzle-kit`) · migration `drizzle/0000_init`

The schema lives in code: `server/src/db/schema.js` declares the seven tables,
the six enums, the indexes and the relations, and `drizzle-kit generate` turns
that declaration into the SQL migrations in `server/drizzle/`. There is no
generated client and no query engine to download — `pg` speaks the protocol
directly.

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

## Local setup

```bash
# PostgreSQL role + database
sudo -u postgres psql -c "CREATE USER insurance WITH PASSWORD '<pw>' CREATEDB;"
sudo -u postgres psql -c "CREATE DATABASE insurance_db OWNER insurance;"

cd server
cp .env.example .env         # fill in DATABASE_URL + JWT_SECRET
npm run db:migrate           # apply server/drizzle/*.sql
npm run db:seed              # demo accounts
npm run dev                  # API on :5000
```

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

One `pg` pool, wrapped by Drizzle once, in `server/src/db/index.js`. The API,
the seed scripts and the test suites all import that module, so there is a
single place where the connection is configured:

```js
export const pool = new Pool({ connectionString, options: '-c timezone=UTC' });
export const db = drizzle(pool, { schema });
```

* **No engine, no codegen.** The earlier Prisma setup needed a query-engine
  binary; when it could not be downloaded the WASM engine refused to start
  without a driver adapter, which is what `npm run dev` tripped over. Drizzle
  queries `pg` directly, so the API boots with nothing but `DATABASE_URL`.
* **`timezone=UTC` on the session.** The timestamp columns are
  `timestamp(3)` without a time zone (as in the original design) and the API
  hands out `Date` objects; pinning the session to UTC keeps a date of birth
  written as `1990-04-12T00:00:00.000Z` coming back as exactly that instant,
  whatever time zone the server runs in.
* **`updatedAt` is written by the application**, together with `createdAt`, the
  way Prisma's `@updatedAt` used to — the columns deliberately have no
  database default.
* **Decimal money** comes back from `pg` as a string (`"24500"`), which is what
  the client already formats with `Number(...).toFixed(2)`.
* **Errors** are mapped from SQLSTATE instead of Prisma error codes: `23505`
  (unique violation) → `409`, `23503` (foreign key) → `409`. Drizzle wraps
  driver failures in a `DrizzleQueryError`, so `error.js` unwraps `.cause`
  before looking at the code.

## Schema verification

`server/tests/schema.test.mjs` reads the *live* Drizzle schema objects (nothing
is re-parsed from a text file) and compares them with the connected database:
every table exists, every column has the right type / precision / nullability
/ default, the primary key is `id`, every enum has the same values in the same
order, every index and unique index exists with the same columns, every foreign
key points at the right table, column and `ON DELETE` / `ON UPDATE` rule, and
the applied migrations match `drizzle/meta/_journal.json`. It runs as part of
`npm test`, so a migration that was never applied fails the suite instead of
surfacing later as a runtime error.

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
