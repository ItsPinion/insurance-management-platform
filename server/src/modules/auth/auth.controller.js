import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../../lib/prisma.js';
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
  const user = await prisma.user.create({
    data: { name: data.name, email: data.email.toLowerCase(), password: hashed, role: 'CUSTOMER' },
  });

  res.status(201).json({ token: signToken(user), user: publicUser(user) });
}

// POST /api/auth/login — FR-1.1, FR-1.2
export async function login(req, res) {
  const data = loginSchema.parse(req.body);

  const user = await prisma.user.findUnique({ where: { email: data.email.toLowerCase() } });
  const valid = user && (await bcrypt.compare(data.password, user.password));
  if (!valid) throw new ApiError(401, 'Invalid email or password');

  res.json({ token: signToken(user), user: publicUser(user) });
}

// GET /api/auth/me — current user from JWT
export async function me(req, res) {
  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    include: { customer: { select: { id: true } } },
  });
  if (!user) throw new ApiError(404, 'User not found');
  res.json({ user: publicUser(user) });
}

// POST /api/auth/users — FR-1.4 (admin creates agent/admin accounts)
export async function createUser(req, res) {
  const data = createUserSchema.parse(req.body);

  const hashed = await bcrypt.hash(data.password, SALT_ROUNDS);
  const user = await prisma.user.create({
    data: { name: data.name, email: data.email.toLowerCase(), password: hashed, role: data.role },
  });

  res.status(201).json({ user: publicUser(user) });
}

// GET /api/auth/users — admin: list all users (employee management)
export async function listUsers(_req, res) {
  const users = await prisma.user.findMany({
    select: { id: true, name: true, email: true, role: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
  });
  res.json({ users });
}
