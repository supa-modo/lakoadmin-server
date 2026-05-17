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
import commissionEntriesRoutes from '../modules/commissions/commissionEntries.routes';
import commissionQuotesRoutes from '../modules/commissionQuotes/commissionQuotes.routes';
import agentsRoutes from '../modules/agents/agents.routes';
import accountingRoutes from '../modules/accounting/accounting.routes';

// Policy modules
import policiesRoutes from '../modules/policies/policies.routes';
import renewalsRoutes from '../modules/renewals/renewals.routes';
import paymentsRoutes from '../modules/payments/payments.routes';
import claimsRoutes from '../modules/claims/claims.routes';
import communicationsRoutes from '../modules/communications/communications.routes';
import notificationsRoutes from '../modules/communications/notifications.routes';
import workflowsRoutes from '../modules/workflows/workflows.routes';
import documentsRoutes from '../modules/documents/documents.routes';
import executiveRoutes from '../modules/executive/executive.routes';
import searchRoutes from '../modules/search/search.routes';
import dashboardsRoutes from '../modules/dashboards/dashboards.routes';
import agentPortalRoutes from '../modules/agent-portal/agentPortal.routes';
import agentCommissionRoutes from '../modules/agent-commission/agentCommission.routes';

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
router.use('/commissions', commissionEntriesRoutes);
router.use('/commission-quotes', commissionQuotesRoutes);

// Policy routes
router.use('/policies', policiesRoutes);
router.use('/renewals', renewalsRoutes);
router.use('/payments', paymentsRoutes);
router.use('/claims', claimsRoutes);
router.use('/communications', communicationsRoutes);
router.use('/notifications', notificationsRoutes);
router.use('/agents', agentsRoutes);
router.use('/accounting', accountingRoutes);
router.use('/workflows', workflowsRoutes);
router.use('/documents', documentsRoutes);
router.use('/executive', executiveRoutes);
router.use('/search', searchRoutes);
router.use('/dashboards', dashboardsRoutes);

// Agent portal & internal agent commissions
router.use('/agent', agentPortalRoutes);
router.use('/admin', agentCommissionRoutes);

export default router;
