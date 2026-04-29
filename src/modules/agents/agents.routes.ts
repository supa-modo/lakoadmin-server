import { Router } from 'express';
import { authenticateToken } from '../../middleware/auth';
import { requirePermission } from '../../middleware/rbac';
import { validate } from '../../middleware/validate';
import { createAgentSchema, updateAgentSchema } from './agents.validation';
import {
  createAgentHandler,
  deactivateAgentHandler,
  getAgentHandler,
  getAgentMetricsHandler,
  getAgentStatementHandler,
  listAgentsHandler,
  updateAgentHandler,
} from './agents.controller';

const router = Router();

router.use(authenticateToken);

router.get('/', requirePermission('agents.read'), listAgentsHandler);
router.post('/', requirePermission('agents.create'), validate(createAgentSchema), createAgentHandler);
router.get('/:id', requirePermission('agents.read'), getAgentHandler);
router.patch('/:id', requirePermission('agents.update'), validate(updateAgentSchema), updateAgentHandler);
router.delete('/:id', requirePermission('agents.delete'), deactivateAgentHandler);
router.get('/:id/metrics', requirePermission('agents.read'), getAgentMetricsHandler);
router.get('/:id/statement', requirePermission('commissions.statement'), getAgentStatementHandler);

export default router;

