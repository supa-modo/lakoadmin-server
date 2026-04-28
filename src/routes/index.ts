import { Router } from 'express';
import authRoutes from '../modules/auth/auth.routes';
import usersRoutes from '../modules/users/users.routes';
import rolesRoutes from '../modules/roles/roles.routes';
import permissionsRoutes from '../modules/permissions/permissions.routes';
import auditLogsRoutes from '../modules/auditLogs/auditLogs.routes';
import settingsRoutes from '../modules/settings/settings.routes';

// CRM modules
import leadsRoutes from '../modules/leads/leads.routes';
import clientsRoutes from '../modules/clients/clients.routes';
import tasksRoutes from '../modules/tasks/tasks.routes';
import onboardingRoutes from '../modules/onboarding/onboarding.routes';

// Catalog modules
import insurersRoutes from '../modules/insurers/insurers.routes';
import productsRoutes from '../modules/products/products.routes';
import commissionsRoutes from '../modules/commissions/commissions.routes';

// Policy modules
import policiesRoutes from '../modules/policies/policies.routes';
import renewalsRoutes from '../modules/renewals/renewals.routes';
import paymentsRoutes from '../modules/payments/payments.routes';

const router = Router();

// Auth & Admin routes
router.use('/auth', authRoutes);
router.use('/users', usersRoutes);
router.use('/roles', rolesRoutes);
router.use('/permissions', permissionsRoutes);
router.use('/audit-logs', auditLogsRoutes);
router.use('/settings', settingsRoutes);

// CRM routes
router.use('/leads', leadsRoutes);
router.use('/clients', clientsRoutes);
router.use('/tasks', tasksRoutes);
router.use('/onboarding', onboardingRoutes);

// Catalog routes
router.use('/insurers', insurersRoutes);
router.use('/products', productsRoutes);
router.use('/commission-rules', commissionsRoutes);

// Policy routes
router.use('/policies', policiesRoutes);
router.use('/renewals', renewalsRoutes);
router.use('/payments', paymentsRoutes);

export default router;
