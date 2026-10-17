import { Router } from 'express';
import { asyncHandler } from '../../middleware/error.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import * as ctrl from './customer.controller.js';

const router = Router();

router.use(requireAuth);

router.get('/', requireRole('ADMIN', 'AGENT'), asyncHandler(ctrl.listCustomers));
router.post('/', requireRole('ADMIN', 'AGENT'), asyncHandler(ctrl.createCustomer));
router.get('/:id', asyncHandler(ctrl.getCustomer)); // customers: own profile only
router.put('/:id', requireRole('ADMIN', 'AGENT'), asyncHandler(ctrl.updateCustomer));
router.get('/:id/history', asyncHandler(ctrl.customerHistory));

export default router;
