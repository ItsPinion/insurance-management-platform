import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { desc, eq } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { users } from '../../db/schema.js';
import { ApiError } from '../../middleware/error.js';
import { registerSchema, loginSchema, createUserSchema } from './auth.schemas.js';

const SALT_ROUNDS = 10;

function signToken(user) {
  return jwt.sign(
    { id: user.id, role: user.role, name: user.name },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '1d' }
  );
}

function publicUser(user) {
  const { password, ...rest } = user;
  return rest;
}

// POST /api/auth/register — FR-1.1, FR-1.4 (customer self-registration)
export async function register(req, res) {
  const data = registerSchema.parse(req.body);

  const hashed = await bcrypt.hash(data.password, SALT_ROUNDS);
  const now = new Date();
  const [user] = await db
    .insert(users)
    .values({
      name: data.name,
      email: data.email.toLowerCase(),
      password: hashed,
      role: 'CUSTOMER',
      // createdAt and updatedAt are written together so the two stay equal,
      // the way Prisma's @updatedAt used to do
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  res.status(201).json({ token: signToken(user), user: publicUser(user) });
}

// POST /api/auth/login — FR-1.1, FR-1.2
export async function login(req, res) {
  const data = loginSchema.parse(req.body);

  const [user] = await db.select().from(users).where(eq(users.email, data.email.toLowerCase()));
  const valid = user && (await bcrypt.compare(data.password, user.password));
  if (!valid) throw new ApiError(401, 'Invalid email or password');

  res.json({ token: signToken(user), user: publicUser(user) });
}

// GET /api/auth/me — current user from JWT
export async function me(req, res) {
  const user = await db.query.users.findFirst({
    where: eq(users.id, req.user.id),
    with: { customer: { columns: { id: true } } },
  });
  // The token is still signed correctly but the account is gone (deleted or
  // the database was reset), so the session cannot be used any more.
  if (!user) throw new ApiError(401, 'Session is no longer valid');
  res.json({ user: publicUser(user) });
}

// POST /api/auth/users — FR-1.4 (admin creates agent/admin accounts)
export async function createUser(req, res) {
  const data = createUserSchema.parse(req.body);

  const hashed = await bcrypt.hash(data.password, SALT_ROUNDS);
  const now = new Date();
  const [user] = await db
    .insert(users)
    .values({
      name: data.name,
      email: data.email.toLowerCase(),
      password: hashed,
      role: data.role,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  res.status(201).json({ user: publicUser(user) });
}

// GET /api/auth/users — admin: list all users (employee management)
export async function listUsers(_req, res) {
  const list = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      createdAt: users.createdAt,
    })
    .from(users)
    .orderBy(desc(users.createdAt));
  res.json({ users: list });
}
