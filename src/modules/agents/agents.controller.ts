import { Response, NextFunction } from 'express';
import { AuthRequest } from '../../types/express';
import { buildPaginationMeta, sendCreated, sendError, sendPaginated, sendSuccess } from '../../utils/apiResponse';
import { logAudit } from '../../services/auditService';
import {
  createAgent,
  deactivateAgent,
  getAgentById,
  getAgentMetrics,
  getAgentStatement,
  listAgents,
  updateAgent,
} from './agents.service';

function handleAgentError(error: unknown, res: Response, next: NextFunction): void {
  const message = (error as Error).message;
  if (message.includes('not found')) {
    sendError(res, message, 404);
    return;
  }
  next(error);
}

export async function listAgentsHandler(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { agents, total, page, limit } = await listAgents(req);
    sendPaginated(res, agents, buildPaginationMeta(total, page, limit));
  } catch (error) {
    next(error);
  }
}

export async function getAgentHandler(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    sendSuccess(res, await getAgentById(req.params.id));
  } catch (error) {
    handleAgentError(error, res, next);
  }
}

export async function createAgentHandler(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const agent = await createAgent(req.body, req.user!.id);
    logAudit(req, 'CREATE', 'Agent', agent.id, null, agent as any);
    sendCreated(res, agent, 'Agent created successfully');
  } catch (error) {
    next(error);
  }
}

export async function updateAgentHandler(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const before = await getAgentById(req.params.id).catch(() => null);
    const agent = await updateAgent(req.params.id, req.body);
    logAudit(req, 'UPDATE', 'Agent', agent.id, before as any, agent as any);
    sendSuccess(res, agent, 'Agent updated successfully');
  } catch (error) {
    handleAgentError(error, res, next);
  }
}

export async function deactivateAgentHandler(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const agent = await deactivateAgent(req.params.id, req.user!.id);
    logAudit(req, 'UPDATE', 'Agent', agent.id, null, { status: agent.status });
    sendSuccess(res, agent, 'Agent deactivated');
  } catch (error) {
    handleAgentError(error, res, next);
  }
}

export async function getAgentMetricsHandler(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    sendSuccess(res, await getAgentMetrics(req.params.id));
  } catch (error) {
    handleAgentError(error, res, next);
  }
}

export async function getAgentStatementHandler(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const dateFrom = req.query.dateFrom ? new Date(req.query.dateFrom as string) : undefined;
    const dateTo = req.query.dateTo ? new Date(req.query.dateTo as string) : undefined;
    sendSuccess(res, await getAgentStatement(req.params.id, dateFrom, dateTo));
  } catch (error) {
    handleAgentError(error, res, next);
  }
}
