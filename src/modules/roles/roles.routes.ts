import { Router } from 'express';
import { authenticateToken } from '../../middleware/auth';
import { requirePermission } from '../../middleware/rbac';
import { getRoles, getRole, createRoleHandler, updateRoleHandler, updateRolePermissions } from './roles.controller';

const router = Router();

router.use(authenticateToken);

router.get('/', requirePermission('roles.read'), getRoles);
router.post('/', requirePermission('roles.create'), createRoleHandler);
router.get('/:id', requirePermission('roles.read'), getRole);
router.patch('/:id', requirePermission('roles.update'), updateRoleHandler);
router.patch('/:id/permissions', requirePermission('roles.update'), updateRolePermissions);

export default router;
