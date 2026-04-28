import { Router } from 'express';
import { authenticateToken } from '../../middleware/auth';
import { requirePermission } from '../../middleware/rbac';
import { validate } from '../../middleware/validate';
import {
  createCommissionRuleSchema,
  updateCommissionRuleSchema,
  calculateCommissionSchema,
} from './commissions.validation';
import {
  getCommissionRules,
  getCommissionRule,
  createCommissionRuleHandler,
  updateCommissionRuleHandler,
  deactivateCommissionRuleHandler,
  calculateCommissionHandler,
} from './commissions.controller';

const router = Router();

router.use(authenticateToken);

router.get('/', requirePermission('products.read'), getCommissionRules);
router.post('/', requirePermission('products.create'), validate(createCommissionRuleSchema), createCommissionRuleHandler);
router.post('/calculate', requirePermission('products.read'), validate(calculateCommissionSchema), calculateCommissionHandler);
router.get('/:id', requirePermission('products.read'), getCommissionRule);
router.patch('/:id', requirePermission('products.update'), validate(updateCommissionRuleSchema), updateCommissionRuleHandler);
router.delete('/:id', requirePermission('products.delete'), deactivateCommissionRuleHandler);

export default router;
