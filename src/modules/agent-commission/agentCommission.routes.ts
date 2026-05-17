import { Router } from 'express';
import { authenticateToken } from '../../middleware/auth';
import { requirePermission } from '../../middleware/rbac';
import {
  approveCommission,
  assignClient,
  assignLead,
  assignPolicy,
  createManualCommission,
  createRule,
  listCommissions,
  listRules,
  markPaid,
  markPayable,
  reverseCommission,
  updateRule,
} from './agentCommission.controller';

const router = Router();

router.use(authenticateToken);

router.get(
  '/agent-commission-rules',
  requirePermission('agent.commissions.manage'),
  listRules,
);
router.post(
  '/agent-commission-rules',
  requirePermission('agent.commissions.manage'),
  createRule,
);
router.patch(
  '/agent-commission-rules/:id',
  requirePermission('agent.commissions.manage'),
  updateRule,
);

router.get(
  '/agent-commissions',
  requirePermission('agent.commissions.manage'),
  listCommissions,
);
router.post(
  '/agent-commissions/manual',
  requirePermission('agent.commissions.manage'),
  createManualCommission,
);
router.patch(
  '/agent-commissions/:id/approve',
  requirePermission('agent.commissions.manage'),
  approveCommission,
);
router.patch(
  '/agent-commissions/:id/mark-payable',
  requirePermission('agent.commissions.manage'),
  markPayable,
);
router.patch(
  '/agent-commissions/:id/mark-paid',
  requirePermission('agent.commissions.manage'),
  markPaid,
);
router.patch(
  '/agent-commissions/:id/reverse',
  requirePermission('agent.commissions.manage'),
  reverseCommission,
);

router.patch(
  '/leads/:id/assign-agent',
  requirePermission('leads.update'),
  assignLead,
);
router.patch(
  '/clients/:id/assign-agent',
  requirePermission('clients.update'),
  assignClient,
);
router.patch(
  '/policies/:id/assign-agent',
  requirePermission('policies.update'),
  assignPolicy,
);

export default router;
