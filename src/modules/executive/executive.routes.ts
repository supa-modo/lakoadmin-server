import { Router } from 'express';
import { authenticateToken } from '../../middleware/auth';
import { requirePermission } from '../../middleware/rbac';
import {
  agentPerformanceHandler,
  cashPositionHandler,
  claimsExposureHandler,
  clientGrowthHandler,
  commissionsHandler,
  insurerPayablesHandler,
  premiumCollectionsHandler,
  renewalRiskHandler,
  revenuePipelineHandler,
  slaBreachesHandler,
  summaryHandler,
} from './executive.controller';

const router = Router();

router.use(authenticateToken);
router.use(requirePermission('executive.dashboard.read'));

router.get('/summary', summaryHandler);
router.get('/revenue-pipeline', revenuePipelineHandler);
router.get('/premium-collections', premiumCollectionsHandler);
router.get('/commissions', commissionsHandler);
router.get('/insurer-payables', insurerPayablesHandler);
router.get('/claims-exposure', claimsExposureHandler);
router.get('/renewal-risk', renewalRiskHandler);
router.get('/agent-performance', agentPerformanceHandler);
router.get('/cash-position', cashPositionHandler);
router.get('/sla-breaches', slaBreachesHandler);
router.get('/client-growth', clientGrowthHandler);

export default router;
