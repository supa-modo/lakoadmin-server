import { Router } from 'express';
import { authenticateToken } from '../../middleware/auth';
import { requirePermission } from '../../middleware/rbac';
import { requireAgentPortalRole, requireAgentProfile } from '../../middleware/agentPortal';
import { validate } from '../../middleware/validate';
import {
  createAgentLeadSchema,
  createAgentTaskSchema,
  convertAgentLeadSchema,
  createLeadCommunicationSchema,
  createLeadProposalSchema,
  rejectLeadProposalSchema,
  updateAgentLeadSchema,
  updateAgentProfileSchema,
  updateAgentTaskSchema,
  updateLeadProposalSchema,
} from './agentPortal.validation';
import {
  completeTaskHandler,
  convertLeadHandler,
  createCommunicationHandler,
  createLeadHandler,
  createProposalHandler,
  createTaskHandler,
  getClientHandler,
  getCommissionHandler,
  getDashboardHandler,
  getLeadHandler,
  getPolicyHandler,
  getProfileHandler,
  getProposalHandler,
  listClientsHandler,
  listCommissionsHandler,
  listCommunicationsHandler,
  listLeadsHandler,
  listPoliciesHandler,
  listProposalsHandler,
  listTasksHandler,
  markProposalAcceptedHandler,
  markProposalRejectedHandler,
  markProposalSentHandler,
  updateLeadHandler,
  updateProfileHandler,
  updateProposalHandler,
  updateTaskHandler,
} from './agentPortal.controller';

const router = Router();

router.use(authenticateToken);
router.use(requireAgentPortalRole);
router.use(requirePermission('agents.portal.read'));
router.use(requireAgentProfile);

router.get('/dashboard', getDashboardHandler);
router.get('/profile', getProfileHandler);
router.patch('/profile', requirePermission('agents.portal.write'), validate(updateAgentProfileSchema), updateProfileHandler);

router.get('/leads', listLeadsHandler);
router.post('/leads', requirePermission('leads.create'), validate(createAgentLeadSchema), createLeadHandler);
router.get('/leads/:id', getLeadHandler);
router.patch('/leads/:id', requirePermission('leads.update'), validate(updateAgentLeadSchema), updateLeadHandler);
router.get('/leads/:id/communications', listCommunicationsHandler);
router.post('/leads/:id/communications', requirePermission('communications.send'), validate(createLeadCommunicationSchema), createCommunicationHandler);
router.post('/leads/:id/proposals', requirePermission('leads.update'), validate(createLeadProposalSchema), createProposalHandler);
router.post('/leads/:id/convert', requirePermission('leads.convert'), validate(convertAgentLeadSchema), convertLeadHandler);

router.get('/proposals', listProposalsHandler);
router.get('/proposals/:id', getProposalHandler);
router.patch('/proposals/:id', requirePermission('leads.update'), validate(updateLeadProposalSchema), updateProposalHandler);
router.post('/proposals/:id/mark-sent', requirePermission('leads.update'), markProposalSentHandler);
router.post('/proposals/:id/mark-accepted', requirePermission('leads.update'), markProposalAcceptedHandler);
router.post('/proposals/:id/mark-rejected', requirePermission('leads.update'), validate(rejectLeadProposalSchema), markProposalRejectedHandler);

router.get('/clients', listClientsHandler);
router.get('/clients/:id', getClientHandler);

router.get('/policies', listPoliciesHandler);
router.get('/policies/:id', getPolicyHandler);

router.get('/tasks', listTasksHandler);
router.post('/tasks', requirePermission('tasks.create'), validate(createAgentTaskSchema), createTaskHandler);
router.patch('/tasks/:id', requirePermission('tasks.update'), validate(updateAgentTaskSchema), updateTaskHandler);
router.post('/tasks/:id/complete', requirePermission('tasks.complete'), completeTaskHandler);

router.get('/commissions', requirePermission('agent.commissions.read'), listCommissionsHandler);
router.get('/commissions/:id', requirePermission('agent.commissions.read'), getCommissionHandler);

export default router;
