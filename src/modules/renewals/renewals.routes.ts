import { Router } from 'express';
import { authenticateToken } from '../../middleware/auth';
import { requirePermission } from '../../middleware/rbac';
import { getRenewalsDueHandler } from '../policies/policies.controller';

const router = Router();

router.use(authenticateToken);

/**
 * GET /api/renewals
 * Returns all policies due for renewal within the specified daysAhead window.
 * Query params: daysAhead (default 30), insurerId, agentId, page, limit
 */
router.get('/', requirePermission('policies.read'), getRenewalsDueHandler);

export default router;
