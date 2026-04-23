import { Router } from 'express';
import { authenticateToken } from '../../middleware/auth';
import { requirePermission } from '../../middleware/rbac';
import { validate } from '../../middleware/validate';
import {
  createLeadSchema,
  updateLeadSchema,
  listLeadsSchema,
  assignLeadSchema,
  updateStatusSchema,
  convertToClientSchema,
  logActivitySchema,
} from './leads.validation';
import {
  getLeads,
  getLead,
  createLeadHandler,
  updateLeadHandler,
  deleteLeadHandler,
  assignLeadHandler,
  updateLeadStatusHandler,
  convertToClientHandler,
  logActivityHandler,
  checkDuplicateHandler,
} from './leads.controller';

const router = Router();

router.use(authenticateToken);

router.get('/', requirePermission('leads.read'), validate(listLeadsSchema, 'query'), getLeads);
router.post('/', requirePermission('leads.create'), validate(createLeadSchema), createLeadHandler);
router.get('/check-duplicate', requirePermission('leads.read'), checkDuplicateHandler);
router.get('/:id', requirePermission('leads.read'), getLead);
router.patch('/:id', requirePermission('leads.update'), validate(updateLeadSchema), updateLeadHandler);
router.delete('/:id', requirePermission('leads.delete'), deleteLeadHandler);
router.post('/:id/assign', requirePermission('leads.assign'), validate(assignLeadSchema), assignLeadHandler);
router.patch('/:id/status', requirePermission('leads.update'), validate(updateStatusSchema), updateLeadStatusHandler);
router.post('/:id/convert', requirePermission('leads.convert'), validate(convertToClientSchema), convertToClientHandler);
router.post('/:id/activities', requirePermission('leads.update'), validate(logActivitySchema), logActivityHandler);

export default router;
