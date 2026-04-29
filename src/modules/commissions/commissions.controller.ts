import { Response, NextFunction } from 'express';
import { AuthRequest } from '../../types/express';
import { sendSuccess, sendCreated, sendError, buildPaginationMeta, sendPaginated } from '../../utils/apiResponse';
import { logAudit } from '../../services/auditService';
import {
  approveCommissionEntry,
  clawbackCommissionEntry,
  listCommissionRules,
  getCommissionRuleById,
  createCommissionRule,
  updateCommissionRule,
  deactivateCommissionRule,
  calculateCommission,
  getCommissionEntryById,
  getInsurerCommissionReceivables,
  holdCommissionEntry,
  listCommissionEntries,
  payCommissionEntry,
  recordInsurerCommissionPayment,
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

function handleCommissionError(error: unknown, res: Response, next: NextFunction): void {
  const message = (error as Error).message;
  if (message.includes('not found')) {
    sendError(res, message, 404);
    return;
  }
  if (message.includes('Cannot') || message.includes('cannot') || message.includes('must be')) {
    sendError(res, message, 400);
    return;
  }
  next(error);
}

export async function listCommissionEntriesHandler(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { entries, total, page, limit } = await listCommissionEntries(req);
    sendPaginated(res, entries, buildPaginationMeta(total, page, limit));
  } catch (error) {
    next(error);
  }
}

export async function getCommissionEntryHandler(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    sendSuccess(res, await getCommissionEntryById(req.params.id));
  } catch (error) {
    handleCommissionError(error, res, next);
  }
}

export async function approveCommissionEntryHandler(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const entry = await approveCommissionEntry(req.params.id, req.user!.id, req.body?.notes);
    logAudit(req, 'UPDATE', 'CommissionEntry', entry.id, null, { status: entry.status });
    sendSuccess(res, entry, 'Commission approved');
  } catch (error) {
    handleCommissionError(error, res, next);
  }
}

export async function holdCommissionEntryHandler(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const entry = await holdCommissionEntry(req.params.id, req.body.reason);
    logAudit(req, 'UPDATE', 'CommissionEntry', entry.id, null, { status: entry.status, reason: req.body.reason });
    sendSuccess(res, entry, 'Commission held');
  } catch (error) {
    handleCommissionError(error, res, next);
  }
}

export async function payCommissionEntryHandler(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const entry = await payCommissionEntry(req.params.id, req.body, req.user!.id);
    logAudit(req, 'UPDATE', 'CommissionEntry', entry.id, null, { status: entry.status, paymentReference: entry.paymentReference });
    sendSuccess(res, entry, 'Commission paid');
  } catch (error) {
    handleCommissionError(error, res, next);
  }
}

export async function clawbackCommissionEntryHandler(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const entry = await clawbackCommissionEntry(req.params.id, req.body, req.user!.id);
    logAudit(req, 'CREATE', 'CommissionEntry', entry.id, null, { status: entry.status, clawbackOfId: entry.clawbackOfId });
    sendCreated(res, entry, 'Commission clawback recorded');
  } catch (error) {
    handleCommissionError(error, res, next);
  }
}

export async function insurerCommissionReceivablesHandler(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    sendSuccess(res, await getInsurerCommissionReceivables(req));
  } catch (error) {
    next(error);
  }
}

export async function recordInsurerCommissionPaymentHandler(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const receipt = await recordInsurerCommissionPayment(req.body, req.user!.id);
    logAudit(req, 'CREATE', 'InsurerCommissionReceipt', receipt.id, null, receipt as any);
    sendCreated(res, receipt, 'Insurer commission payment recorded');
  } catch (error) {
    handleCommissionError(error, res, next);
  }
}
