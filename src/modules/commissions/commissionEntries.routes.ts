import { Router } from 'express';
import { authenticateToken } from '../../middleware/auth';
import { requirePermission } from '../../middleware/rbac';
import { validate } from '../../middleware/validate';
import {
  commissionApprovalSchema,
  commissionClawbackSchema,
  commissionHoldSchema,
  commissionPaySchema,
  recordInsurerCommissionPaymentSchema,
} from './commissions.validation';
import {
  approveCommissionEntryHandler,
  clawbackCommissionEntryHandler,
  getCommissionEntryHandler,
  insurerCommissionReceivablesHandler,
  holdCommissionEntryHandler,
  listCommissionEntriesHandler,
  payCommissionEntryHandler,
  recordInsurerCommissionPaymentHandler,
} from './commissions.controller';

const router = Router();

router.use(authenticateToken);

router.get('/', requirePermission('commissions.read'), listCommissionEntriesHandler);
router.get('/insurer-receivables', requirePermission('commissions.read'), insurerCommissionReceivablesHandler);
router.post('/insurer-payments', requirePermission('commissions.pay'), validate(recordInsurerCommissionPaymentSchema), recordInsurerCommissionPaymentHandler);
router.get('/:id', requirePermission('commissions.read'), getCommissionEntryHandler);
router.post('/:id/approve', requirePermission('commissions.approve'), validate(commissionApprovalSchema), approveCommissionEntryHandler);
router.post('/:id/hold', requirePermission('commissions.hold'), validate(commissionHoldSchema), holdCommissionEntryHandler);
router.post('/:id/pay', requirePermission('commissions.pay'), validate(commissionPaySchema), payCommissionEntryHandler);
router.post('/:id/clawback', requirePermission('commissions.clawback'), validate(commissionClawbackSchema), clawbackCommissionEntryHandler);

export default router;

