import { NextFunction, Response } from 'express';
import { AuthRequest } from '../../types/express';
import { sendCreated, sendSuccess } from '../../utils/apiResponse';
import { prisma } from '../../config/database';
import { recordDirectInsurerPayment, recordPayment } from '../payments/payments.service';
import {
  calculatePolicyCommission,
  getClientLifecycleSummary,
  getPolicyAccountingSummary,
  getPolicyCommissionSummary,
  getPolicyFinancialSummary,
  getPolicyTimeline,
  getPolicyWorkflowReadiness,
} from './workflows.service';

function handleWorkflowError(err: Error, res: Response, next: NextFunction) {
  if (/not found/i.test(err.message)) {
    res.status(404).json({ success: false, message: err.message });
    return;
  }
  if (/blocked|cannot|already|must/i.test(err.message)) {
    res.status(400).json({ success: false, message: err.message });
    return;
  }
  next(err);
}

export async function policyReadinessHandler(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    sendSuccess(res, await getPolicyWorkflowReadiness(req.params.id ?? req.params.policyId));
  } catch (err) {
    handleWorkflowError(err as Error, res, next);
  }
}

export async function clientLifecycleSummaryHandler(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    sendSuccess(res, await getClientLifecycleSummary(req.params.id));
  } catch (err) {
    handleWorkflowError(err as Error, res, next);
  }
}

export async function policyFinancialSummaryHandler(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    sendSuccess(res, await getPolicyFinancialSummary(req.params.id ?? req.params.policyId));
  } catch (err) {
    handleWorkflowError(err as Error, res, next);
  }
}

export async function policyCommissionSummaryHandler(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    sendSuccess(res, await getPolicyCommissionSummary(req.params.id ?? req.params.policyId));
  } catch (err) {
    handleWorkflowError(err as Error, res, next);
  }
}

export async function policyAccountingSummaryHandler(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    sendSuccess(res, await getPolicyAccountingSummary(req.params.id ?? req.params.policyId));
  } catch (err) {
    handleWorkflowError(err as Error, res, next);
  }
}

export async function calculatePolicyCommissionHandler(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    sendSuccess(res, await calculatePolicyCommission(req.params.id ?? req.params.policyId, req.user!.id), 'Commission calculated');
  } catch (err) {
    handleWorkflowError(err as Error, res, next);
  }
}

export async function policyTimelineHandler(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    sendSuccess(res, await getPolicyTimeline(req.params.id ?? req.params.policyId));
  } catch (err) {
    handleWorkflowError(err as Error, res, next);
  }
}

export async function recordPolicyPaymentHandler(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const policy = await prisma.policy.findFirst({
      where: { id: req.params.id, deletedAt: null },
      select: { id: true, clientId: true, policyNumber: true, premiumCollectionMode: true },
    });
    if (!policy) throw new Error('Policy not found');
    if (policy.premiumCollectionMode === 'DIRECT_TO_INSURER') {
      throw new Error(`Cannot record broker-collected payment for direct-to-insurer policy ${policy.policyNumber}. Use the direct insurer payment workflow instead.`);
    }

    const payment = await recordPayment({
      ...req.body,
      clientId: policy.clientId,
      premiumCollectionMode: policy.premiumCollectionMode === 'MIXED' ? 'MIXED' : 'BROKER_COLLECTED',
      allocations: req.body.allocations?.length
        ? req.body.allocations
        : [{ policyId: policy.id, amount: req.body.amount, notes: req.body.notes ?? null }],
    }, req.user!.id);

    sendCreated(res, payment, 'Policy payment recorded');
  } catch (err) {
    handleWorkflowError(err as Error, res, next);
  }
}

export async function recordPolicyDirectInsurerPaymentHandler(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const payment = await recordDirectInsurerPayment({
      ...req.body,
      policyId: req.params.id,
    }, req.user!.id);
    sendCreated(res, payment, 'Direct-to-insurer policy payment recorded');
  } catch (err) {
    handleWorkflowError(err as Error, res, next);
  }
}
