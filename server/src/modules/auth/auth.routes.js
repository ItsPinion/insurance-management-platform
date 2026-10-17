import { Router } from 'express';
import { asyncHandler } from '../../middleware/error.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import * as ctrl from './auth.controller.js';

const router = Router();

router.post('/register', asyncHandler(ctrl.register));
router.post('/login', asyncHandler(ctrl.login));
router.get('/me', requireAuth, asyncHandler(ctrl.me));

// Admin-only user management (FR-1.4)
router.post('/users', requireAuth, requireRole('ADMIN'), asyncHandler(ctrl.createUser));
router.get('/users', requireAuth, requireRole('ADMIN'), asyncHandler(ctrl.listUsers));

export default router;
