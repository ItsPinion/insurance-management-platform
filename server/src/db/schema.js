import { relations } from 'drizzle-orm';
import {
  foreignKey,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

// ---------- Enums ----------
// The enum (and table) names are quoted identifiers, so they keep the
// camelCase spelling the rest of the application uses.

export const roleEnum = pgEnum('Role', ['ADMIN', 'AGENT', 'CUSTOMER']);

export const policyTypeEnum = pgEnum('PolicyType', [
  'HEALTH',
  'LIFE',
  'VEHICLE',
  'HOME',
  'TRAVEL',
]);

export const policyStatusEnum = pgEnum('PolicyStatus', ['ACTIVE', 'EXPIRED', 'CANCELLED']);

export const claimStatusEnum = pgEnum('ClaimStatus', [
  'SUBMITTED',
  'UNDER_REVIEW',
  'APPROVED',
  'REJECTED',
]);

export const paymentStatusEnum = pgEnum('PaymentStatus', ['PAID', 'PENDING', 'OVERDUE']);

export const documentTypeEnum = pgEnum('DocumentType', ['IDENTITY', 'POLICY', 'CLAIM', 'OTHER']);

/**
 * `timestamp(3)` without a time zone — the same column type the original
 * schema used. `mode: 'date'` hands JavaScript `Date` objects to the API
 * layer and the pool pins the PostgreSQL session to UTC (see src/db/index.js),
 * so a date such as a date of birth round-trips unchanged.
 */
const ts = (name) => timestamp(name, { mode: 'date', precision: 3 });

const createdAt = () => ts('createdAt').notNull().defaultNow();

// `updatedAt` has no database default — the application sets it on write,
// exactly like Prisma's `@updatedAt` did.
const updatedAt = () => ts('updatedAt').notNull();

// ---------- Tables ----------

export const users = pgTable(
  'User',
  {
    id: serial('id').primaryKey(),
    name: text('name').notNull(),
    email: text('email').notNull(),
    password: text('password').notNull(), // bcrypt hash
    role: roleEnum('role').notNull().default('CUSTOMER'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('User_email_key').on(t.email), index('User_role_idx').on(t.role)],
);

export const customers = pgTable(
  'Customer',
  {
    id: serial('id').primaryKey(),
    name: text('name').notNull(),
    dob: ts('dob').notNull(),
    phone: text('phone').notNull(),
    address: text('address').notNull(),
    email: text('email').notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),

    // Optional link to a login account (customers registered by an agent may
    // not have a login yet)
    userId: integer('userId'),
  },
  (t) => [
    uniqueIndex('Customer_email_key').on(t.email),
    uniqueIndex('Customer_userId_key').on(t.userId),
    index('Customer_name_idx').on(t.name),
    index('Customer_phone_idx').on(t.phone),
    foreignKey({ name: 'Customer_userId_fkey', columns: [t.userId], foreignColumns: [users.id] })
      .onUpdate('cascade')
      .onDelete('set null'),
  ],
);

export const policies = pgTable(
  'Policy',
  {
    id: serial('id').primaryKey(),
    policyNumber: text('policyNumber').notNull(),
    policyType: policyTypeEnum('policyType').notNull(),
    premiumAmount: numeric('premiumAmount', { precision: 12, scale: 2 }).notNull(),
    startDate: ts('startDate').notNull(),
    endDate: ts('endDate').notNull(),
    status: policyStatusEnum('status').notNull().default('ACTIVE'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),

    customerId: integer('customerId').notNull(),
  },
  (t) => [
    uniqueIndex('Policy_policyNumber_key').on(t.policyNumber),
    index('Policy_customerId_idx').on(t.customerId),
    index('Policy_status_idx').on(t.status),
    index('Policy_endDate_idx').on(t.endDate),
    foreignKey({
      name: 'Policy_customerId_fkey',
      columns: [t.customerId],
      foreignColumns: [customers.id],
    })
      .onUpdate('cascade')
      .onDelete('restrict'),
  ],
);

export const claims = pgTable(
  'Claim',
  {
    id: serial('id').primaryKey(),
    claimNumber: text('claimNumber').notNull(),
    claimAmount: numeric('claimAmount', { precision: 12, scale: 2 }).notNull(),
    reason: text('reason').notNull(),
    status: claimStatusEnum('status').notNull().default('SUBMITTED'),
    submissionDate: ts('submissionDate').notNull().defaultNow(),
    reviewRemarks: text('reviewRemarks'),
    reviewedAt: ts('reviewedAt'),

    policyId: integer('policyId').notNull(),

    reviewerId: integer('reviewerId'),
  },
  (t) => [
    uniqueIndex('Claim_claimNumber_key').on(t.claimNumber),
    index('Claim_policyId_idx').on(t.policyId),
    index('Claim_status_idx').on(t.status),
    foreignKey({
      name: 'Claim_policyId_fkey',
      columns: [t.policyId],
      foreignColumns: [policies.id],
    })
      .onUpdate('cascade')
      .onDelete('restrict'),
    foreignKey({
      name: 'Claim_reviewerId_fkey',
      columns: [t.reviewerId],
      foreignColumns: [users.id],
    })
      .onUpdate('cascade')
      .onDelete('set null'),
  ],
);

export const premiumPayments = pgTable(
  'PremiumPayment',
  {
    id: serial('id').primaryKey(),
    amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
    dueDate: ts('dueDate').notNull(),
    paymentDate: ts('paymentDate'),
    paymentStatus: paymentStatusEnum('paymentStatus').notNull().default('PENDING'),
    createdAt: createdAt(),

    policyId: integer('policyId').notNull(),
  },
  (t) => [
    index('PremiumPayment_policyId_idx').on(t.policyId),
    index('PremiumPayment_paymentStatus_idx').on(t.paymentStatus),
    index('PremiumPayment_dueDate_idx').on(t.dueDate),
    foreignKey({
      name: 'PremiumPayment_policyId_fkey',
      columns: [t.policyId],
      foreignColumns: [policies.id],
    })
      .onUpdate('cascade')
      .onDelete('restrict'),
  ],
);

export const documents = pgTable(
  'Document',
  {
    id: serial('id').primaryKey(),
    fileName: text('fileName').notNull(), // original name shown to users
    filePath: text('filePath').notNull(), // path on disk (uploads/…)
    mimeType: text('mimeType').notNull(),
    sizeBytes: integer('sizeBytes').notNull(),
    docType: documentTypeEnum('docType').notNull().default('OTHER'),
    uploadedAt: ts('uploadedAt').notNull().defaultNow(),

    customerId: integer('customerId').notNull(),

    // Optional link when the document supports a claim
    claimId: integer('claimId'),
  },
  (t) => [
    index('Document_customerId_idx').on(t.customerId),
    index('Document_claimId_idx').on(t.claimId),
    foreignKey({
      name: 'Document_customerId_fkey',
      columns: [t.customerId],
      foreignColumns: [customers.id],
    })
      .onUpdate('cascade')
      .onDelete('restrict'),
    foreignKey({
      name: 'Document_claimId_fkey',
      columns: [t.claimId],
      foreignColumns: [claims.id],
    })
      .onUpdate('cascade')
      .onDelete('set null'),
  ],
);

// ---------- Relations ----------

export const usersRelations = relations(users, ({ one, many }) => ({
  // A CUSTOMER user is linked 1–1 to a Customer record
  customer: one(customers, { fields: [users.id], references: [customers.userId] }),
  // Claims this user (agent/admin) reviewed
  reviewedClaims: many(claims, { relationName: 'ClaimReviewer' }),
}));

export const customersRelations = relations(customers, ({ one, many }) => ({
  user: one(users, { fields: [customers.userId], references: [users.id] }),
  policies: many(policies),
  documents: many(documents),
}));

export const policiesRelations = relations(policies, ({ one, many }) => ({
  customer: one(customers, { fields: [policies.customerId], references: [customers.id] }),
  claims: many(claims),
  payments: many(premiumPayments),
}));

export const claimsRelations = relations(claims, ({ one, many }) => ({
  policy: one(policies, { fields: [claims.policyId], references: [policies.id] }),
  reviewer: one(users, {
    fields: [claims.reviewerId],
    references: [users.id],
    relationName: 'ClaimReviewer',
  }),
  documents: many(documents),
}));

export const premiumPaymentsRelations = relations(premiumPayments, ({ one }) => ({
  policy: one(policies, {
    fields: [premiumPayments.policyId],
    references: [policies.id],
  }),
}));

export const documentsRelations = relations(documents, ({ one }) => ({
  customer: one(customers, { fields: [documents.customerId], references: [customers.id] }),
  claim: one(claims, { fields: [documents.claimId], references: [claims.id] }),
}));
