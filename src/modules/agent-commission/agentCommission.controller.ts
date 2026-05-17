import { Request, Response, NextFunction } from 'express';
import { logAudit } from '../../services/auditService';
import { sendSuccess, sendCreated, sendError } from '../../utils/apiResponse';
import { AuthRequest } from '../../types/express';
import {
  approveAgentCommission,
  assignClientAgent,
  assignLeadAgent,
  assignPolicyAgent,
  createAgentCommissionRule,
  createManualAgentCommission,
  listAgentCommissionRules,
  listAllAgentCommissions,
  markAgentCommissionPaid,
  markAgentCommissionPayable,
  reverseAgentCommission,
  updateAgentCommissionRule,
} from './agentCommission.service';
import {
  assignAgentSchema,
  createAgentCommissionRuleSchema,
  manualAgentCommissionSchema,
  markCommissionPaidSchema,
  updateAgentCommissionRuleSchema,
} from './agentCommission.validation';

function handleError(error: unknown, res: Response, next: NextFunction): void {
  const message = error instanceof Error ? error.message : 'Request failed';
  if (message.includes('not found')) {
    sendError(res, message, 404);
    return;
  }
  if (message.includes('cannot') || message.includes('Only') || message.includes('No applicable')) {
    sendError(res, message, 400);
    return;
  }
  next(error);
}

export async function listRules(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    sendSuccess(res, await listAgentCommissionRules(req.query));
  } catch (error) {
    handleError(error, res, next);
  }
}

export async function createRule(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const parsed = createAgentCommissionRuleSchema.parse(req.body);
    const rule = await createAgentCommissionRule(parsed, req.user!.id);
    logAudit(req, 'CREATE', 'AgentCommissionRule', rule.id, null, { name: rule.name });
    sendCreated(res, rule);
  } catch (error) {
    handleError(error, res, next);
  }
}

export async function updateRule(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const parsed = updateAgentCommissionRuleSchema.parse(req.body);
    const rule = await updateAgentCommissionRule(req.params.id, parsed);
    logAudit(req, 'UPDATE', 'AgentCommissionRule', rule.id);
    sendSuccess(res, rule);
  } catch (error) {
    handleError(error, res, next);
  }
}

export async function listCommissions(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    sendSuccess(res, await listAllAgentCommissions(req.query));
  } catch (error) {
    handleError(error, res, next);
  }
}

export async function approveCommission(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const commission = await approveAgentCommission(req.params.id, req.user!.id);
    logAudit(req, 'APPROVE', 'AgentCommission', commission.id);
    sendSuccess(res, commission);
  } catch (error) {
    handleError(error, res, next);
  }
}

export async function markPayable(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    sendSuccess(res, await markAgentCommissionPayable(req.params.id, req.user!.id));
  } catch (error) {
    handleError(error, res, next);
  }
}

export async function markPaid(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const parsed = markCommissionPaidSchema.parse(req.body);
    const commission = await markAgentCommissionPaid(req.params.id, req.user!.id, parsed);
    logAudit(req, 'PAY', 'AgentCommission', commission.id, null, { paymentReference: parsed.paymentReference });
    sendSuccess(res, commission);
  } catch (error) {
    handleError(error, res, next);
  }
}

export async function reverseCommission(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const notes = typeof req.body?.notes === 'string' ? req.body.notes : undefined;
    sendSuccess(res, await reverseAgentCommission(req.params.id, req.user!.id, notes));
  } catch (error) {
    handleError(error, res, next);
  }
}

export async function createManualCommission(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const parsed = manualAgentCommissionSchema.parse(req.body);
    sendCreated(res, await createManualAgentCommission(parsed, req.user!.id));
  } catch (error) {
    handleError(error, res, next);
  }
}

export async function assignLead(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const parsed = assignAgentSchema.parse(req.body);
    const lead = await assignLeadAgent(req.params.id, parsed.agentId, req.user!.id);
    logAudit(req, 'ASSIGN', 'Lead', lead.id, null, { agentId: parsed.agentId });
    sendSuccess(res, lead);
  } catch (error) {
    handleError(error, res, next);
  }
}

export async function assignClient(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const parsed = assignAgentSchema.parse(req.body);
    const client = await assignClientAgent(req.params.id, parsed.agentId, req.user!.id);
    logAudit(req, 'ASSIGN', 'Client', client.id, null, { agentId: parsed.agentId });
    sendSuccess(res, client);
  } catch (error) {
    handleError(error, res, next);
  }
}

export async function assignPolicy(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const parsed = assignAgentSchema.parse(req.body);
    const policy = await assignPolicyAgent(req.params.id, parsed.agentId, req.user!.id);
    logAudit(req, 'ASSIGN', 'Policy', policy.id, null, { agentId: parsed.agentId });
    sendSuccess(res, policy);
  } catch (error) {
    handleError(error, res, next);
  }
}
