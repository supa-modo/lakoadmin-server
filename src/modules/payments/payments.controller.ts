import fs from 'fs';
import { Response, NextFunction } from 'express';
import { AuthRequest } from '../../types/express';
import { buildPaginationMeta, sendCreated, sendError, sendPaginated, sendSuccess } from '../../utils/apiResponse';
import { logAudit } from '../../services/auditService';
import {
  allocatePayment,
  createInvoice,
  ensureReceiptArtifactForDownload,
  failPayment,
  getPaymentById,
  getPaymentStats,
  getPolicyBalance,
  listDirectInsurerPayments,
  listBankAccounts,
  listInvoices,
  listMpesaAccounts,
  listPayments,
  recordDirectInsurerPayment,
  recordPayment,
  reversePayment,
  verifyDirectInsurerPayment,
  verifyPayment,
} from './payments.service';

function handlePaymentError(error: unknown, res: Response, next: NextFunction): void {
  const message = (error as Error).message;
  if (message.includes('not found')) {
    sendError(res, message, 404);
    return;
  }
  if (
    message.includes('Cannot') ||
    message.includes('exceed') ||
    message.includes('Only') ||
    message.includes('already') ||
    message.includes('requires')
  ) {
    sendError(res, message, 400);
    return;
  }
  next(error);
}

export async function getPayments(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { payments, total, page, limit } = await listPayments(req);
    sendPaginated(res, payments, buildPaginationMeta(total, page, limit));
  } catch (error) {
    next(error);
  }
}

export async function getPaymentsStats(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const stats = await getPaymentStats();
    sendSuccess(res, stats);
  } catch (error) {
    next(error);
  }
}

export async function getDirectInsurerPayments(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { payments, total, page, limit } = await listDirectInsurerPayments(req);
    sendPaginated(res, payments, buildPaginationMeta(total, page, limit));
  } catch (error) {
    next(error);
  }
}

export async function getPayment(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const payment = await getPaymentById(req.params.id);
    sendSuccess(res, payment);
  } catch (error) {
    handlePaymentError(error, res, next);
  }
}

export async function recordPaymentHandler(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const payment = await recordPayment(req.body, req.user!.id);
    logAudit(req, 'CREATE', 'Payment', payment.id, null, {
      paymentNumber: payment.paymentNumber,
      amount: payment.amount,
      status: payment.status,
    });
    sendCreated(res, payment, 'Payment recorded successfully');
  } catch (error) {
    handlePaymentError(error, res, next);
  }
}

export async function recordDirectInsurerPaymentHandler(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const payment = await recordDirectInsurerPayment(req.body, req.user!.id);
    logAudit(req, 'CREATE', 'DirectInsurerPayment', payment.id, null, {
      policyId: payment.policyId,
      amount: payment.amount,
      verificationStatus: payment.verificationStatus,
    });
    sendCreated(res, payment, 'Direct-to-insurer payment recorded');
  } catch (error) {
    handlePaymentError(error, res, next);
  }
}

export async function verifyDirectInsurerPaymentHandler(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const payment = await verifyDirectInsurerPayment(req.params.id, req.body, req.user!.id);
    logAudit(req, 'UPDATE', 'DirectInsurerPayment', payment.id, null, {
      verificationStatus: payment.verificationStatus,
      policyId: payment.policyId,
    });
    sendSuccess(res, payment, 'Direct-to-insurer payment verification updated');
  } catch (error) {
    handlePaymentError(error, res, next);
  }
}

export async function allocatePaymentHandler(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const before = await getPaymentById(req.params.id).catch(() => null);
    const payment = await allocatePayment(req.params.id, req.body, req.user!.id);
    logAudit(req, 'UPDATE', 'Payment', payment.id, before as any, {
      status: payment.status,
      allocations: payment.allocations.length,
    });
    sendSuccess(res, payment, 'Payment allocated successfully');
  } catch (error) {
    handlePaymentError(error, res, next);
  }
}

export async function verifyPaymentHandler(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const payment = await verifyPayment(req.params.id, req.user!.id);
    logAudit(req, 'UPDATE', 'Payment', payment.id, { status: 'PENDING' }, { status: payment.status });
    sendSuccess(res, payment, 'Payment verified');
  } catch (error) {
    handlePaymentError(error, res, next);
  }
}

export async function failPaymentHandler(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const payment = await failPayment(req.params.id, req.body.reason, req.user!.id);
    logAudit(req, 'UPDATE', 'Payment', payment.id, null, { status: 'FAILED', reason: req.body.reason });
    sendSuccess(res, payment, 'Payment marked as failed');
  } catch (error) {
    handlePaymentError(error, res, next);
  }
}

export async function reversePaymentHandler(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const before = await getPaymentById(req.params.id).catch(() => null);
    const payment = await reversePayment(req.params.id, req.body.reason, req.user!.id);
    logAudit(req, 'UPDATE', 'Payment', payment.id, before as any, { status: 'REVERSED', reason: req.body.reason });
    sendSuccess(res, payment, 'Payment reversed successfully');
  } catch (error) {
    handlePaymentError(error, res, next);
  }
}

export async function getPolicyBalanceHandler(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const balance = await getPolicyBalance(req.params.policyId);
    sendSuccess(res, balance);
  } catch (error) {
    handlePaymentError(error, res, next);
  }
}

export async function getInvoices(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { invoices, total, page, limit } = await listInvoices(req);
    sendPaginated(res, invoices, buildPaginationMeta(total, page, limit));
  } catch (error) {
    next(error);
  }
}

export async function createInvoiceHandler(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const invoice = await createInvoice(req.body, req.user!.id);
    logAudit(req, 'CREATE', 'Invoice', invoice.id, null, {
      invoiceNumber: invoice.invoiceNumber,
      totalAmount: invoice.totalAmount,
    });
    sendCreated(res, invoice, 'Invoice created successfully');
  } catch (error) {
    handlePaymentError(error, res, next);
  }
}

export async function getBankAccounts(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    sendSuccess(res, await listBankAccounts());
  } catch (error) {
    next(error);
  }
}

export async function getMpesaAccounts(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    sendSuccess(res, await listMpesaAccounts());
  } catch (error) {
    next(error);
  }
}

export async function downloadReceipt(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const payment = await ensureReceiptArtifactForDownload(req.params.id);
    const receipt = payment.receipt;
    if (!receipt?.fileUrl) {
      sendError(res, 'Receipt artifact not found', 404);
      return;
    }

    if (/^https?:\/\//i.test(receipt.fileUrl)) {
      res.redirect(receipt.fileUrl);
      return;
    }

    if (!fs.existsSync(receipt.fileUrl)) {
      sendError(res, 'Receipt file not found on disk', 404);
      return;
    }

    res.download(receipt.fileUrl, `${receipt.receiptNumber}.${receipt.mimeType === 'application/pdf' ? 'pdf' : 'html'}`);
  } catch (error) {
    handlePaymentError(error, res, next);
  }
}
