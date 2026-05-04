import { Router } from 'express';
import { authenticateToken } from '../../middleware/auth';
import { requirePermission } from '../../middleware/rbac';
import {
  clientLifecycleSummaryHandler,
  policyReadinessHandler,
} from './workflows.controller';

const router = Router();

router.use(authenticateToken);

router.get('/policy/:policyId/readiness', requirePermission('policies.read'), policyReadinessHandler);
router.get('/client/:id/lifecycle-summary', requirePermission('clients.read'), clientLifecycleSummaryHandler);

export default router;
