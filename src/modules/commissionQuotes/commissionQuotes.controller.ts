import { Response, NextFunction } from 'express';
import { AuthRequest } from '../../types/express';
import * as service from './commissionQuotes.service';
import { createAuditLog } from '../../services/auditService';

export async function createCommissionQuoteHandler(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const quoteId = await service.createCommissionQuoteFromPolicy(
      req.body.policyId,
      req.user!.id,
      req.body.expectedCommissionRate
    );
    const quote = await service.getCommissionQuoteById(quoteId);
    await createAuditLog({ userId: req.user!.id, action: 'CREATE', entity: 'CommissionQuote', entityId: quoteId, after: quote });
    res.status(201).json(quote);
  } catch (error) {
    next(error);
  }
}

export async function updateCommissionQuoteHandler(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const quote = await service.updateCommissionQuote(
      req.params.id,
      req.body,
      req.user!.id
    );
    await createAuditLog({ userId: req.user!.id, action: 'UPDATE', entity: 'CommissionQuote', entityId: req.params.id, after: quote });
    res.json(quote);
  } catch (error) {
    next(error);
  }
}

export async function reconcileCommissionQuoteHandler(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const quote = await service.reconcileCommissionQuote(
      req.params.id,
      req.body,
      req.user!.id
    );
    await createAuditLog({ userId: req.user!.id, action: 'RECONCILE', entity: 'CommissionQuote', entityId: req.params.id, after: quote });
    res.json(quote);
  } catch (error) {
    next(error);
  }
}

export async function createCommissionInvoiceHandler(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const invoice = await service.createCommissionInvoice(req.body, req.user!.id);
    await createAuditLog({ userId: req.user!.id, action: 'CREATE', entity: 'CommissionInvoice', entityId: invoice.id, after: invoice });
    res.status(201).json(invoice);
  } catch (error) {
    next(error);
  }
}

export async function recordCommissionPaymentHandler(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const payment = await service.recordCommissionPayment(req.body, req.user!.id);
    await createAuditLog({ userId: req.user!.id, action: 'CREATE', entity: 'CommissionPayment', entityId: payment.id, after: payment });
    res.status(201).json(payment);
  } catch (error) {
    next(error);
  }
}

export async function uploadInsurerStatementHandler(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const statement = await service.uploadInsurerStatement(req.body, req.user!.id);
    await createAuditLog({ userId: req.user!.id, action: 'CREATE', entity: 'InsurerCommissionStatement', entityId: statement.id, after: statement });
    res.status(201).json(statement);
  } catch (error) {
    next(error);
  }
}

export async function matchStatementLineHandler(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const line = await service.matchStatementLine(req.body, req.user!.id);
    await createAuditLog({ userId: req.user!.id, action: 'MATCH', entity: 'InsurerCommissionStatementLine', entityId: req.body.statementLineId, after: line });
    res.json(line);
  } catch (error) {
    next(error);
  }
}

export async function listCommissionQuotesHandler(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const result = await service.listCommissionQuotes(req);
    res.json(result);
  } catch (error) {
    next(error);
  }
}

export async function getCommissionQuoteHandler(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const quote = await service.getCommissionQuoteById(req.params.id);
    res.json(quote);
  } catch (error) {
    next(error);
  }
}

export async function listInsurerStatementsHandler(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const result = await service.listInsurerStatements(req);
    res.json(result);
  } catch (error) {
    next(error);
  }
}
