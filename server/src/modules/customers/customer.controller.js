import {
  count,
  countDistinct,
  desc,
  eq,
  ilike,
  like,
  or,
} from 'drizzle-orm';
import { db } from '../../db/index.js';
import {
  claims,
  customers,
  documents,
  policies,
  premiumPayments,
} from '../../db/schema.js';
import { ApiError } from '../../middleware/error.js';
import {
  createCustomerSchema,
  updateCustomerSchema,
  listQuerySchema,
} from './customer.schemas.js';

// the columns the list and the detail screen share
const customerColumns = {
  id: customers.id,
  name: customers.name,
  dob: customers.dob,
  phone: customers.phone,
  address: customers.address,
  email: customers.email,
  createdAt: customers.createdAt,
  updatedAt: customers.updatedAt,
  userId: customers.userId,
};

// the API returns the related record counts the way the client expects them
function toCustomer(row) {
  const { policyCount, documentCount, ...customer } = row;
  return { ...customer, _count: { policies: policyCount, documents: documentCount } };
}

// GET /api/customers — FR-2.3 search + pagination (ADMIN, AGENT)
export async function listCustomers(req, res) {
  const { search, page, limit } = listQuerySchema.parse(req.query);

  const where = search
    ? or(
        ilike(customers.name, `%${search}%`),
        ilike(customers.email, `%${search}%`),
        like(customers.phone, `%${search}%`),
      )
    : undefined;

  // the count and the page are independent, so they run in parallel
  const [[{ total }], rows] = await Promise.all([
    db.select({ total: count() }).from(customers).where(where),
    db
      .select({
        ...customerColumns,
        policyCount: countDistinct(policies.id),
        documentCount: countDistinct(documents.id),
      })
      .from(customers)
      .leftJoin(policies, eq(policies.customerId, customers.id))
      .leftJoin(documents, eq(documents.customerId, customers.id))
      .where(where)
      .groupBy(customers.id)
      // createdAt desc, with the id as a tiebreaker so two rows written in the
      // same millisecond still produce a stable page
      .orderBy(desc(customers.createdAt), desc(customers.id))
      .limit(limit)
      .offset((page - 1) * limit),
  ]);

  res.json({
    customers: rows.map(toCustomer),
    pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
  });
}

// POST /api/customers — FR-2.1 (ADMIN, AGENT)
export async function createCustomer(req, res) {
  const data = createCustomerSchema.parse(req.body);
  const now = new Date();
  const [customer] = await db
    .insert(customers)
    .values({ ...data, email: data.email.toLowerCase(), createdAt: now, updatedAt: now })
    .returning();
  res.status(201).json({ customer });
}

// Customers may only view their own profile
async function assertCanAccess(reqUser, customerId) {
  if (reqUser.role !== 'CUSTOMER') return;
  const [own] = await db
    .select({ id: customers.id })
    .from(customers)
    .where(eq(customers.userId, reqUser.id));
  if (!own || own.id !== customerId) {
    throw new ApiError(403, 'You can only view your own profile');
  }
}

// GET /api/customers/:id — FR-2.2 (ADMIN, AGENT, or own profile)
export async function getCustomer(req, res) {
  const id = Number(req.params.id);
  await assertCanAccess(req.user, id);

  const [row] = await db
    .select({
      ...customerColumns,
      policyCount: countDistinct(policies.id),
      documentCount: countDistinct(documents.id),
    })
    .from(customers)
    .leftJoin(policies, eq(policies.customerId, customers.id))
    .leftJoin(documents, eq(documents.customerId, customers.id))
    .where(eq(customers.id, id))
    .groupBy(customers.id);

  if (!row) throw new ApiError(404, 'Customer not found');
  res.json({ customer: toCustomer(row) });
}

// PUT /api/customers/:id — FR-2.2 (ADMIN, AGENT)
export async function updateCustomer(req, res) {
  const id = Number(req.params.id);
  const data = updateCustomerSchema.parse(req.body);
  if (data.email) data.email = data.email.toLowerCase();

  const [customer] = await db
    .update(customers)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(customers.id, id))
    .returning();

  if (!customer) throw new ApiError(404, 'Record not found');
  res.json({ customer });
}

// GET /api/customers/:id/history — FR-2.4 (ADMIN, AGENT, or own)
export async function customerHistory(req, res) {
  const id = Number(req.params.id);
  await assertCanAccess(req.user, id);

  const customer = await db.query.customers.findFirst({
    where: eq(customers.id, id),
    with: {
      policies: {
        orderBy: [desc(policies.createdAt), desc(policies.id)],
        with: {
          claims: { orderBy: [desc(claims.submissionDate), desc(claims.id)] },
          payments: { orderBy: [desc(premiumPayments.dueDate), desc(premiumPayments.id)] },
        },
      },
      documents: { orderBy: [desc(documents.uploadedAt), desc(documents.id)] },
    },
  });
  if (!customer) throw new ApiError(404, 'Customer not found');
  res.json({ customer });
}
