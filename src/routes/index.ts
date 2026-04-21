import { Router } from 'express';
import authRoutes from '../modules/auth/auth.routes';
import usersRoutes from '../modules/users/users.routes';
import rolesRoutes from '../modules/roles/roles.routes';
import permissionsRoutes from '../modules/permissions/permissions.routes';
import auditLogsRoutes from '../modules/auditLogs/auditLogs.routes';
import settingsRoutes from '../modules/settings/settings.routes';

const router = Router();

router.use('/auth', authRoutes);
router.use('/users', usersRoutes);
router.use('/roles', rolesRoutes);
router.use('/permissions', permissionsRoutes);
router.use('/audit-logs', auditLogsRoutes);
router.use('/settings', settingsRoutes);

export default router;
