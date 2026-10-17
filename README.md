# 🛡️ Insurance Management Platform

A full-stack web application for managing insurance operations — customers, policies,
claims, premium payments, documents, and business reports — with role-based access
for **Administrators**, **Insurance Agents**, and **Customers**.

> Internship project · 14-day build schedule

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React.js + Tailwind CSS |
| Backend | Node.js + Express.js |
| Database | PostgreSQL + Prisma ORM |
| Auth | JWT + bcrypt |
| Uploads | Multer |
| Validation | Zod |
| Charts | Chart.js |
| PDF | PDFKit |
| Hosting | Vercel (client) · Render (server) |

## Repository Structure

```
insurance-management-platform/
├── client/     # React frontend (scaffolded Day 3+)
├── server/     # Express API
│   ├── prisma/            # schema.prisma, migrations, seed.js
│   └── src/
│       ├── app.js         # Express app wiring
│       ├── index.js       # entrypoint
│       ├── lib/           # prisma client
│       ├── middleware/    # auth (JWT + roles), error handling
│       └── modules/auth/  # routes / controller / Zod schemas
└── docs/
    ├── requirements.md    # Requirement analysis (Day 1)
    ├── wireframes.html    # Low-fi UI wireframes (Day 1)
    └── database.md        # ERD + design decisions (Day 2)
```

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

## Day 1 Deliverables

- **[docs/requirements.md](docs/requirements.md)** — functional & non-functional
  requirements, permissions matrix, core workflow, data model, API surface, risks.
- **[docs/wireframes.html](docs/wireframes.html)** — low-fidelity wireframes for the
  8 key screens (open in any browser).
- Git repository initialized with branch `main`.
