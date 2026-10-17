import express from 'express';
import cors from 'cors';
import authRoutes from './modules/auth/auth.routes.js';
import customerRoutes from './modules/customers/customer.routes.js';
import { notFoundHandler, errorHandler } from './middleware/error.js';

export function createApp() {
  const app = express();

  app.use(cors());
  app.use(express.json());

  app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

  app.use('/api/auth', authRoutes);
  app.use('/api/customers', customerRoutes);
  // Day 4+: /api/policies, /api/claims, /api/payments,
  //         /api/documents, /api/reports

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
