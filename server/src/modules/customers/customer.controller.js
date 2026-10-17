import { prisma } from '../../lib/prisma.js';
import { ApiError } from '../../middleware/error.js';
import {
  createCustomerSchema,
  updateCustomerSchema,
  listQuerySchema,
} from './customer.schemas.js';

// GET /api/customers — FR-2.3 search + pagination (ADMIN, AGENT)
export async function listCustomers(req, res) {
  const { search, page, limit } = listQuerySchema.parse(req.query);

  const where = search
    ? {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } },
          { phone: { contains: search } },
        ],
      }
    : {};

  const [total, customers] = await Promise.all([
    prisma.customer.count({ where }),
    prisma.customer.findMany({
      where,
      include: { _count: { select: { policies: true, documents: true } } },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);

  res.json({
    customers,
    pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
  });
}

// POST /api/customers — FR-2.1 (ADMIN, AGENT)
export async function createCustomer(req, res) {
  const data = createCustomerSchema.parse(req.body);
  const customer = await prisma.customer.create({
    data: { ...data, email: data.email.toLowerCase() },
  });
  res.status(201).json({ customer });
}

// Customers may only view their own profile
async function assertCanAccess(reqUser, customerId) {
  if (reqUser.role !== 'CUSTOMER') return;
  const own = await prisma.customer.findUnique({ where: { userId: reqUser.id } });
  if (!own || own.id !== customerId) {
    throw new ApiError(403, 'You can only view your own profile');
  }
}

// GET /api/customers/:id — FR-2.2 (ADMIN, AGENT, or own profile)
export async function getCustomer(req, res) {
  const id = Number(req.params.id);
  await assertCanAccess(req.user, id);

  const customer = await prisma.customer.findUnique({
    where: { id },
    include: { _count: { select: { policies: true, documents: true } } },
  });
  if (!customer) throw new ApiError(404, 'Customer not found');
  res.json({ customer });
}

// PUT /api/customers/:id — FR-2.2 (ADMIN, AGENT)
export async function updateCustomer(req, res) {
  const id = Number(req.params.id);
  const data = updateCustomerSchema.parse(req.body);
  if (data.email) data.email = data.email.toLowerCase();

  const customer = await prisma.customer.update({ where: { id }, data });
  res.json({ customer });
}

// GET /api/customers/:id/history — FR-2.4 (ADMIN, AGENT, or own)
export async function customerHistory(req, res) {
  const id = Number(req.params.id);
  await assertCanAccess(req.user, id);

  const customer = await prisma.customer.findUnique({
    where: { id },
    include: {
      policies: {
        orderBy: { createdAt: 'desc' },
        include: {
          claims: { orderBy: { submissionDate: 'desc' } },
          payments: { orderBy: { dueDate: 'desc' } },
        },
      },
      documents: { orderBy: { uploadedAt: 'desc' } },
    },
  });
  if (!customer) throw new ApiError(404, 'Customer not found');
  res.json({ customer });
}
