# Database Design — Day 2 Deliverable

PostgreSQL 15 · Prisma ORM 6 · migration: `init`

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

## Local setup

```bash
# PostgreSQL role + database
sudo -u postgres psql -c "CREATE USER insurance WITH PASSWORD '<pw>' CREATEDB;"
sudo -u postgres psql -c "CREATE DATABASE insurance_db OWNER insurance;"

cd server
cp .env.example .env         # fill in DATABASE_URL + JWT_SECRET
npx prisma migrate dev       # apply migrations
node prisma/seed.js          # demo accounts
npm run dev                  # API on :5000
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
