import { Response, NextFunction } from 'express';
import { sendSuccess, sendCreated, sendError, sendPaginated, buildPaginationMeta } from '../../utils/apiResponse';
import { AgentPortalRequest } from '../../middleware/agentPortal';
import { logAudit } from '../../services/auditService';
import * as portalService from './agentPortal.service';

function handleError(error: unknown, res: Response, next: NextFunction): void {
  const message = error instanceof Error ? error.message : 'Request failed';
  if (message.includes('not found') || message.includes('not linked')) {
    sendError(res, message, 404);
    return;
  }
  if (message.includes('cannot') || message.includes('already')) {
    sendError(res, message, 400);
    return;
  }
  next(error);
}

export async function getDashboardHandler(req: AgentPortalRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    sendSuccess(res, await portalService.getAgentDashboard(req.agent!, req.user!.id));
  } catch (error) {
    handleError(error, res, next);
  }
}

export async function getProfileHandler(req: AgentPortalRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    sendSuccess(res, await portalService.getAgentProfile(req.agent!));
  } catch (error) {
    handleError(error, res, next);
  }
}

export async function updateProfileHandler(req: AgentPortalRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const before = await portalService.getAgentProfile(req.agent!);
    const updated = await portalService.updateAgentProfile(req.agent!, req.user!.id, req.body);
    await logAudit(req, 'AGENT_PROFILE_UPDATED', 'Agent', updated.agent.id, before, {
      changedFields: Object.keys(req.body ?? {}),
      profile: updated,
    });
    sendSuccess(res, updated, 'Profile updated');
  } catch (error) {
    handleError(error, res, next);
  }
}

export async function listLeadsHandler(req: AgentPortalRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { leads, total, page, limit } = await portalService.listAgentLeads(req.agent!, req.user!.id, req.query as Record<string, unknown>);
    sendPaginated(res, leads, buildPaginationMeta(total, page, limit));
  } catch (error) {
    handleError(error, res, next);
  }
}

export async function getLeadHandler(req: AgentPortalRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    sendSuccess(res, await portalService.getAgentLead(req.agent!, req.user!.id, req.params.id));
  } catch (error) {
    handleError(error, res, next);
  }
}

export async function createLeadHandler(req: AgentPortalRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const lead = await portalService.createAgentLead(req.agent!, req.user!.id, req.body);
    await logAudit(req, 'AGENT_LEAD_CREATED', 'Lead', lead.id, undefined, lead);
    sendCreated(res, lead);
  } catch (error) {
    handleError(error, res, next);
  }
}

export async function updateLeadHandler(req: AgentPortalRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const lead = await portalService.updateAgentLead(req.agent!, req.user!.id, req.params.id, req.body);
    await logAudit(req, 'AGENT_LEAD_UPDATED', 'Lead', lead.id, undefined, lead);
    sendSuccess(res, lead);
  } catch (error) {
    handleError(error, res, next);
  }
}

export async function listCommunicationsHandler(req: AgentPortalRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    sendSuccess(res, await portalService.listLeadCommunications(req.agent!, req.user!.id, req.params.id));
  } catch (error) {
    handleError(error, res, next);
  }
}

export async function createCommunicationHandler(req: AgentPortalRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const comm = await portalService.createLeadCommunication(req.agent!, req.user!.id, req.params.id, req.body);
    await logAudit(req, 'AGENT_LEAD_COMMUNICATION', 'LeadCommunication', comm.id, undefined, comm);
    sendCreated(res, comm);
  } catch (error) {
    handleError(error, res, next);
  }
}

export async function listProposalsHandler(req: AgentPortalRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { proposals, total, page, limit } = await portalService.listAgentProposals(req.agent!, req.user!.id, req.query as Record<string, unknown>);
    sendPaginated(res, proposals, buildPaginationMeta(total, page, limit));
  } catch (error) {
    handleError(error, res, next);
  }
}

export async function createProposalHandler(req: AgentPortalRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const proposal = await portalService.createLeadProposal(req.agent!, req.user!.id, req.params.id, req.body);
    await logAudit(req, 'AGENT_PROPOSAL_CREATED', 'LeadProposal', proposal.id, undefined, proposal);
    sendCreated(res, proposal);
  } catch (error) {
    handleError(error, res, next);
  }
}

export async function getProposalHandler(req: AgentPortalRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    sendSuccess(res, await portalService.getAgentProposalById(req.agent!, req.user!.id, req.params.id));
  } catch (error) {
    handleError(error, res, next);
  }
}

export async function updateProposalHandler(req: AgentPortalRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const proposal = await portalService.updateAgentProposal(req.agent!, req.user!.id, req.params.id, req.body);
    await logAudit(req, 'AGENT_PROPOSAL_UPDATED', 'LeadProposal', proposal.id, undefined, proposal);
    sendSuccess(res, proposal);
  } catch (error) {
    handleError(error, res, next);
  }
}

export async function markProposalSentHandler(req: AgentPortalRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const proposal = await portalService.markProposalSent(req.agent!, req.user!.id, req.params.id);
    await logAudit(req, 'AGENT_PROPOSAL_SENT', 'LeadProposal', proposal.id);
    sendSuccess(res, proposal);
  } catch (error) {
    handleError(error, res, next);
  }
}

export async function markProposalAcceptedHandler(req: AgentPortalRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const proposal = await portalService.markProposalAccepted(req.agent!, req.user!.id, req.params.id);
    await logAudit(req, 'AGENT_PROPOSAL_ACCEPTED', 'LeadProposal', proposal.id);
    sendSuccess(res, proposal);
  } catch (error) {
    handleError(error, res, next);
  }
}

export async function markProposalRejectedHandler(req: AgentPortalRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const proposal = await portalService.markProposalRejected(req.agent!, req.user!.id, req.params.id, req.body?.rejectionReason ?? req.body?.notes);
    await logAudit(req, 'AGENT_PROPOSAL_REJECTED', 'LeadProposal', proposal.id);
    sendSuccess(res, proposal);
  } catch (error) {
    handleError(error, res, next);
  }
}

export async function listClientsHandler(req: AgentPortalRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { clients, total, page, limit } = await portalService.listAgentClients(req.agent!, req.user!.id, req.query as Record<string, unknown>);
    sendPaginated(res, clients, buildPaginationMeta(total, page, limit));
  } catch (error) {
    handleError(error, res, next);
  }
}

export async function getClientHandler(req: AgentPortalRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    sendSuccess(res, await portalService.getAgentClient(req.agent!, req.user!.id, req.params.id));
  } catch (error) {
    handleError(error, res, next);
  }
}

export async function listPoliciesHandler(req: AgentPortalRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { policies, total, page, limit } = await portalService.listAgentPolicies(req.agent!, req.query as Record<string, unknown>);
    sendPaginated(res, policies, buildPaginationMeta(total, page, limit));
  } catch (error) {
    handleError(error, res, next);
  }
}

export async function getPolicyHandler(req: AgentPortalRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    sendSuccess(res, await portalService.getAgentPolicy(req.agent!, req.params.id));
  } catch (error) {
    handleError(error, res, next);
  }
}

export async function listTasksHandler(req: AgentPortalRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { tasks, total, page, limit, summary } = await portalService.listAgentTasks(req.agent!, req.user!.id, req.query as Record<string, unknown>);
    sendSuccess(res, tasks, 'Success', 200, { pagination: buildPaginationMeta(total, page, limit), summary });
  } catch (error) {
    handleError(error, res, next);
  }
}

export async function createTaskHandler(req: AgentPortalRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const task = await portalService.createAgentTask(req.agent!, req.user!.id, req.body);
    await logAudit(req, 'AGENT_TASK_CREATED', 'Task', task.id, undefined, task);
    sendCreated(res, task);
  } catch (error) {
    handleError(error, res, next);
  }
}

export async function updateTaskHandler(req: AgentPortalRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const task = await portalService.updateAgentTask(req.agent!, req.user!.id, req.params.id, req.body);
    await logAudit(req, 'AGENT_TASK_UPDATED', 'Task', task.id, undefined, task);
    sendSuccess(res, task);
  } catch (error) {
    handleError(error, res, next);
  }
}

export async function completeTaskHandler(req: AgentPortalRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const task = await portalService.completeAgentTask(req.agent!, req.user!.id, req.params.id);
    await logAudit(req, 'AGENT_TASK_COMPLETED', 'Task', task.id, undefined, task);
    sendSuccess(res, task);
  } catch (error) {
    handleError(error, res, next);
  }
}

export async function listCommissionsHandler(req: AgentPortalRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { commissions, total, page, limit, summary } = await portalService.listAgentCommissions(req.agent!, req.query as Record<string, unknown>);
    sendSuccess(res, commissions, 'Success', 200, { pagination: buildPaginationMeta(total, page, limit), summary });
  } catch (error) {
    handleError(error, res, next);
  }
}

export async function getCommissionHandler(req: AgentPortalRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    sendSuccess(res, await portalService.getAgentCommission(req.agent!, req.params.id));
  } catch (error) {
    handleError(error, res, next);
  }
}

export async function convertLeadHandler(req: AgentPortalRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await portalService.convertAgentLead(req.agent!, req.user!.id, req.params.id, req.body);
    await logAudit(req, 'AGENT_LEAD_CONVERTED', 'Client', result.client.id, undefined, result);
    sendCreated(res, result, 'Lead converted to client');
  } catch (error) {
    handleError(error, res, next);
  }
}
