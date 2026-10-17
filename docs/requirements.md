# Insurance Management Platform — Requirement Analysis

**Day 1 Deliverable** · Version 1.0 · 2026-10-17

---

## 1. Project Overview

A web-based platform that digitizes insurance operations: customer records, policy
lifecycle, claim workflows, premium tracking, document storage, and business reporting.

**Problem it solves:** manual paperwork, slow approval cycles, and poor visibility into
policies, payments, and claims.

**Primary actors:** Administrator, Insurance Agent, Customer.

---

## 2. Scope

### In scope (core, Days 1–14)
- Role-based authentication (JWT) with 3 roles: `ADMIN`, `AGENT`, `CUSTOMER`
- Customer management (CRUD, search, history)
- Policy management (create, view, renew, cancel, expiry status)
- Claim management (submit → verify → approve/reject, with documents)
- Premium tracking (record payments, due dates, overdue alerts)
- Document management (upload/download via Multer, local disk storage)
- Reports dashboard (Chart.js): active/expired policies, claims stats, premium
  collection, customer growth
- Search, filters, pagination across list screens
- Validation (Zod) and centralized error handling

### Out of scope (bonus / later)
- Real payment gateway integration (payments are *recorded*, not processed)
- Email/SMS notifications (mock only, if time permits)
- OCR, QR verification, multi-language, audit logs

---

## 3. Functional Requirements

### FR-1 Authentication & Authorization
| ID | Requirement |
|----|-------------|
| FR-1.1 | Users register/login with email + password (bcrypt-hashed) |
| FR-1.2 | JWT issued on login; sent as `Authorization: Bearer <token>` |
| FR-1.3 | Role-based route guards on both API and frontend routes |
| FR-1.4 | Admin can create Agent accounts; Customers self-register |

### FR-2 Customer Management (Admin, Agent)
| ID | Requirement |
|----|-------------|
| FR-2.1 | Register customer with name, DOB, phone, address, email |
| FR-2.2 | View/edit customer profile |
| FR-2.3 | Search customers by name/email/phone; paginated list |
| FR-2.4 | Customer history: linked policies, claims, payments |

### FR-3 Policy Management (Admin, Agent create; Customer views own)
| ID | Requirement |
|----|-------------|
| FR-3.1 | Create policy: type, unique policy number, premium amount, start/end date |
| FR-3.2 | Policy statuses: `ACTIVE`, `EXPIRED`, `CANCELLED` |
| FR-3.3 | Renew policy (extends end date, resets status to ACTIVE) |
| FR-3.4 | Cancel policy with confirmation |
| FR-3.5 | Flag policies expiring within 30 days |

### FR-4 Claim Management
| ID | Requirement |
|----|-------------|
| FR-4.1 | Customer submits claim against an ACTIVE policy (amount + reason) |
| FR-4.2 | Customer attaches supporting documents to a claim |
| FR-4.3 | Claim statuses: `SUBMITTED` → `UNDER_REVIEW` → `APPROVED` / `REJECTED` |
| FR-4.4 | Agent reviews claim, verifies documents, approves/rejects with remarks |
| FR-4.5 | Customer tracks claim status; full claim history retained |

### FR-5 Premium Tracking
| ID | Requirement |
|----|-------------|
| FR-5.1 | Record premium payment: date, amount, status (`PAID`, `PENDING`, `OVERDUE`) |
| FR-5.2 | Due-date tracking per policy |
| FR-5.3 | Payment history per policy/customer |
| FR-5.4 | Overdue payments highlighted on dashboards |

### FR-6 Document Management
| ID | Requirement |
|----|-------------|
| FR-6.1 | Upload identity/policy/claim documents (PDF, JPG, PNG; max 5 MB) |
| FR-6.2 | List and download uploaded files |
| FR-6.3 | Files stored on disk; metadata (name, path, timestamp) in DB |

### FR-7 Reports Dashboard (Admin)
| ID | Requirement |
|----|-------------|
| FR-7.1 | KPI cards: active policies, expired policies, total customers, premiums collected |
| FR-7.2 | Charts: claims by status (doughnut), monthly premium collection (bar), customer growth (line) |
| FR-7.3 | Monthly business report; export to PDF (PDFKit) |

---

## 4. Non-Functional Requirements

| Category | Requirement |
|----------|-------------|
| Security | bcrypt password hashing, JWT expiry, role checks server-side, file-type whitelist |
| Validation | Zod schemas on every API input; friendly client-side form errors |
| Performance | Paginated list endpoints (default 10/page); indexed DB lookups |
| Usability | Responsive (mobile-first Tailwind), consistent layout, loading/empty states |
| Reliability | Centralized Express error middleware; consistent JSON error shape |
| Maintainability | Layered backend (routes → controllers → services), reusable React components |

---

## 5. User Roles & Permissions Matrix

| Capability | Admin | Agent | Customer |
|---|:--:|:--:|:--:|
| Manage agents/users | ✅ | ❌ | ❌ |
| Register/edit customers | ✅ | ✅ | ❌ (self-register only) |
| Create/renew/cancel policies | ✅ | ✅ | ❌ |
| View policies | all | all | own only |
| Submit claims | ❌ | ❌ | ✅ |
| Verify/approve/reject claims | ✅ | ✅ | ❌ |
| Record premium payments | ✅ | ✅ | ✅ (own) |
| Upload documents | ✅ | ✅ | ✅ (own) |
| Reports dashboard | ✅ | summary only | ❌ |

---

## 6. Core Workflow

```
Customer registers / Agent registers customer
        │
        ▼
Agent/Admin creates policy (ACTIVE)
        │
        ├──► Customer pays premiums ──► payment history / overdue alerts
        │
        ├──► Customer uploads documents
        │
        └──► Customer submits claim ──► Agent reviews + verifies docs
                                              │
                                   ┌──────────┴──────────┐
                                   ▼                     ▼
                               APPROVED              REJECTED
                                   │                     │
                                   └────► Claim history ◄┘
Admin monitors everything via Reports Dashboard
```

---

## 7. Data Model (initial)

Entities: **Users**, **Customers**, **Policies**, **Claims**, **PremiumPayments**, **Documents**

Key relationships:
- Customer 1 ──* Policies
- Policy 1 ──* Claims
- Policy 1 ──* PremiumPayments
- Customer 1 ──* Documents (documents optionally linked to a claim)
- User (role=CUSTOMER) 1 ──1 Customer

> Detailed Prisma schema is a **Day 2** deliverable.

---

## 8. API Surface (high-level, finalized per-module during build days)

```
POST   /api/auth/register         POST   /api/auth/login
GET    /api/customers             POST   /api/customers
GET    /api/customers/:id         PUT    /api/customers/:id
GET    /api/policies              POST   /api/policies
PATCH  /api/policies/:id/renew    PATCH  /api/policies/:id/cancel
GET    /api/claims                POST   /api/claims
PATCH  /api/claims/:id/status
GET    /api/payments              POST   /api/payments
POST   /api/documents/upload      GET    /api/documents/:id/download
GET    /api/reports/summary       GET    /api/reports/monthly
```

---

## 9. Tech Stack (confirmed)

React.js + Tailwind CSS · Node.js + Express · PostgreSQL + Prisma · JWT + bcrypt ·
Multer · Zod · Chart.js · PDFKit · Git/GitHub · Render (API) + Vercel (frontend)

---

## 10. Risks & Assumptions

- **Assumption:** payments are recorded manually, no gateway.
- **Assumption:** single company; no multi-tenancy.
- **Risk:** file storage on Render's ephemeral disk — acceptable for internship demo;
  note cloud storage (S3/Cloudinary) as production upgrade.
- **Risk:** scope creep from bonus features — defer all bonuses until Day 12+.
