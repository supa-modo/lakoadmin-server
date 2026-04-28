import { Response, NextFunction } from 'express';
import { AuthRequest } from '../../types/express';
import { sendSuccess, sendCreated, sendError, buildPaginationMeta, sendPaginated } from '../../utils/apiResponse';
import { logAudit } from '../../services/auditService';
import {
  listCommissionRules,
  getCommissionRuleById,
  createCommissionRule,
  updateCommissionRule,
  deactivateCommissionRule,
  calculateCommission,
} from './commissions.service';

export async function getCommissionRules(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { rules, total, page, limit } = await listCommissionRules(req);
    const pagination = buildPaginationMeta(total, page, limit);
    sendPaginated(res, rules, pagination);
  } catch (err) {
    next(err);
  }
}

export async function getCommissionRule(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const rule = await getCommissionRuleById(req.params.id);
    sendSuccess(res, rule);
  } catch (err) {
    if ((err as Error).message === 'Commission rule not found') {
      sendError(res, 'Commission rule not found', 404);
    } else {
      next(err);
    }
  }
}

export async function createCommissionRuleHandler(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const rule = await createCommissionRule(req.body);
    logAudit(req, 'CREATE', 'CommissionRule', rule.id, null, rule);
    sendCreated(res, rule, 'Commission rule created successfully');
  } catch (err) {
    next(err);
  }
}

export async function updateCommissionRuleHandler(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const before = await getCommissionRuleById(req.params.id).catch(() => null);
    const rule = await updateCommissionRule(req.params.id, req.body);
    logAudit(req, 'UPDATE', 'CommissionRule', rule.id, before, rule);
    sendSuccess(res, rule, 'Commission rule updated successfully');
  } catch (err) {
    if ((err as Error).message === 'Commission rule not found') {
      sendError(res, 'Commission rule not found', 404);
    } else {
      next(err);
    }
  }
}

export async function deactivateCommissionRuleHandler(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const rule = await deactivateCommissionRule(req.params.id);
    logAudit(req, 'UPDATE', 'CommissionRule', rule.id, null, { isActive: false });
    sendSuccess(res, rule, 'Commission rule deactivated');
  } catch (err) {
    if ((err as Error).message === 'Commission rule not found') {
      sendError(res, 'Commission rule not found', 404);
    } else {
      next(err);
    }
  }
}

export async function calculateCommissionHandler(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await calculateCommission(req.body);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}
