import { Router } from 'express';
import { authenticateToken } from '../../middleware/auth';
import { requirePermission } from '../../middleware/rbac';
import { requireStaffDashboardAccess } from '../../middleware/staffDashboard';
import { getStaffDashboardHandler, listDashboardRolesHandler } from './dashboards.controller';

const router = Router();

router.use(authenticateToken);
router.use(requireStaffDashboardAccess);
router.use(requirePermission('dashboards.read'));

router.get('/roles', listDashboardRolesHandler);
router.get('/:role', getStaffDashboardHandler);

export default router;
