import { Response, NextFunction } from 'express';
import { AuthRequest } from '../../types/express';
import { buildPaginationMeta, sendCreated, sendError, sendPaginated, sendSuccess } from '../../utils/apiResponse';
import { logAudit } from '../../services/auditService';
import * as service from './accounting.service';

function handleAccountingError(error: unknown, res: Response, next: NextFunction): void {
  const message = (error as Error).message;
  if ((error as any)?.name === 'FinanceValidationError') {
    res.status(400).json({
      success: false,
      message,
      error: (error as any).code ?? 'FINANCE_VALIDATION_ERROR',
      data: (error as any).details ?? null,
    });
    return;
  }
  if ((error as any)?.name === 'DuplicateReferenceWarningError') {
    res.status(409).json({
      success: false,
      message,
      error: 'DUPLICATE_REFERENCE_WARNING',
      data: (error as any).details ?? null,
    });
    return;
  }
  if (message.includes('not found')) {
    sendError(res, message, 404);
    return;
  }
  if (message.includes('Cannot') || message.includes('Only') || message.includes('must') || message.includes('exceeds') || message.includes('balanced') || message.includes('required')) {
    sendError(res, message, 400);
    return;
  }
  next(error);
}

function audit(req: AuthRequest, action: string, entity: string, id: string, data: unknown): void {
  logAudit(req, action, entity, id, null, data as any);
}

export async function financeDashboardHandler(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try { sendSuccess(res, await service.getFinanceDashboard()); } catch (error) { next(error); }
}

export async function ledgerAccountsHandler(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try { sendSuccess(res, await service.listLedgerAccounts()); } catch (error) { next(error); }
}

export async function createLedgerAccountHandler(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try { const row = await service.createLedgerAccount(req.body); audit(req, 'CREATE', 'LedgerAccount', row.id, row); sendCreated(res, row, 'Ledger account created'); } catch (error) { handleAccountingError(error, res, next); }
}

export async function updateLedgerAccountHandler(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try { const row = await service.updateLedgerAccount(req.params.id, req.body); audit(req, 'UPDATE', 'LedgerAccount', row.id, row); sendSuccess(res, row, 'Ledger account updated'); } catch (error) { handleAccountingError(error, res, next); }
}

export async function deactivateLedgerAccountHandler(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try { const row = await service.deactivateLedgerAccount(req.params.id); audit(req, 'UPDATE', 'LedgerAccount', row.id, { isActive: false }); sendSuccess(res, row, 'Ledger account deactivated'); } catch (error) { handleAccountingError(error, res, next); }
}

export async function accountLedgerHandler(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try { sendSuccess(res, await service.getAccountLedger(req.params.id)); } catch (error) { handleAccountingError(error, res, next); }
}

export async function bankAccountsHandler(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try { sendSuccess(res, await service.listBankAccounts()); } catch (error) { next(error); }
}

export async function createBankAccountHandler(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try { const row = await service.createBankAccount(req.body); audit(req, 'CREATE', 'BankAccount', row.id, row); sendCreated(res, row, 'Bank account created'); } catch (error) { handleAccountingError(error, res, next); }
}

export async function updateBankAccountHandler(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try { const row = await service.updateBankAccount(req.params.id, req.body); audit(req, 'UPDATE', 'BankAccount', row.id, row); sendSuccess(res, row, 'Bank account updated'); } catch (error) { handleAccountingError(error, res, next); }
}

export async function deactivateBankAccountHandler(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try { const row = await service.deactivateBankAccount(req.params.id); audit(req, 'UPDATE', 'BankAccount', row.id, { isActive: false }); sendSuccess(res, row, 'Bank account deactivated'); } catch (error) { handleAccountingError(error, res, next); }
}

export async function mpesaAccountsHandler(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try { sendSuccess(res, await service.listMpesaAccounts()); } catch (error) { next(error); }
}

export async function createMpesaAccountHandler(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try { const row = await service.createMpesaAccount(req.body); audit(req, 'CREATE', 'MpesaAccount', row.id, row); sendCreated(res, row, 'M-Pesa account created'); } catch (error) { handleAccountingError(error, res, next); }
}

export async function updateMpesaAccountHandler(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try { const row = await service.updateMpesaAccount(req.params.id, req.body); audit(req, 'UPDATE', 'MpesaAccount', row.id, row); sendSuccess(res, row, 'M-Pesa account updated'); } catch (error) { handleAccountingError(error, res, next); }
}

export async function deactivateMpesaAccountHandler(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try { const row = await service.deactivateMpesaAccount(req.params.id); audit(req, 'UPDATE', 'MpesaAccount', row.id, { isActive: false }); sendSuccess(res, row, 'M-Pesa account deactivated'); } catch (error) { handleAccountingError(error, res, next); }
}

export async function listTransactionsHandler(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { transactions, total, page, limit } = await service.listFinanceTransactions(req);
    sendPaginated(res, transactions, buildPaginationMeta(total, page, limit));
  } catch (error) { next(error); }
}

export async function financeTransactionReversalPreviewHandler(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    sendSuccess(
      res,
      await service.getFinanceTransactionReversalPreview(
        req.params.id,
        req.query.voidSourceRecord !== 'false',
      ),
    );
  } catch (error) { handleAccountingError(error, res, next); }
}

export async function listJournalsHandler(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { entries, total, page, limit } = await service.listJournalEntries(req);
    sendPaginated(res, entries, buildPaginationMeta(total, page, limit));
  } catch (error) { next(error); }
}

export async function createManualJournalHandler(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try { const entry = await service.createManualJournal(req.body, req.user!.id); audit(req, 'CREATE', 'JournalEntry', entry.id, entry); sendCreated(res, entry, 'Draft journal created'); } catch (error) { handleAccountingError(error, res, next); }
}

export async function submitJournalHandler(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try { const entry = await service.submitJournal(req.params.id); audit(req, 'UPDATE', 'JournalEntry', entry.id, { status: entry.status }); sendSuccess(res, entry, 'Journal submitted'); } catch (error) { handleAccountingError(error, res, next); }
}

export async function approveJournalHandler(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try { const entry = await service.approveJournal(req.params.id, req.user!.id); audit(req, 'APPROVE', 'JournalEntry', entry.id, { status: entry.status }); sendSuccess(res, entry, 'Journal approved'); } catch (error) { handleAccountingError(error, res, next); }
}

export async function postJournalHandler(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try { const entry = await service.postManualJournal(req.params.id, req.user!.id); audit(req, 'POST', 'JournalEntry', entry.id, entry); sendSuccess(res, entry, 'Journal posted'); } catch (error) { handleAccountingError(error, res, next); }
}

export async function reverseJournalHandler(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try { const entry = await service.reverseJournal(req.params.id, req.user!.id); audit(req, 'REVERSE', 'JournalEntry', req.params.id, entry); sendSuccess(res, entry, 'Journal reversed'); } catch (error) { handleAccountingError(error, res, next); }
}

export async function createFinancialYearHandler(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try { const year = await service.createFinancialYear(req.body); audit(req, 'CREATE', 'FinancialYear', year.id, year); sendCreated(res, year, 'Financial year created'); } catch (error) { handleAccountingError(error, res, next); }
}

export async function listPeriodsHandler(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try { sendSuccess(res, await service.listFinancialPeriods()); } catch (error) { next(error); }
}

export async function updatePeriodStatusHandler(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try { const period = await service.updateFinancialPeriodStatus(req.params.id, req.body, req.user!.id); audit(req, 'UPDATE', 'FinancialPeriod', period.id, { status: period.status }); sendSuccess(res, period, 'Financial period updated'); } catch (error) { handleAccountingError(error, res, next); }
}

export async function expenseCategoriesHandler(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try { sendSuccess(res, await service.listExpenseCategories()); } catch (error) { next(error); }
}

export async function seedExpenseCategoriesHandler(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try { sendSuccess(res, await service.createDefaultExpenseCategories(), 'Expense categories seeded'); } catch (error) { next(error); }
}

export async function vendorsHandler(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { items, total, page, limit } = await service.listVendors(req);
    sendPaginated(res, items, buildPaginationMeta(total, page, limit));
  } catch (error) { next(error); }
}

export async function createVendorHandler(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try { const vendor = await service.createVendor(req.body); audit(req, 'CREATE', 'Vendor', vendor.id, vendor); sendCreated(res, vendor, 'Vendor created'); } catch (error) { handleAccountingError(error, res, next); }
}

export async function updateVendorHandler(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try { const vendor = await service.updateVendor(req.params.id, req.body); audit(req, 'UPDATE', 'Vendor', vendor.id, vendor); sendSuccess(res, vendor, 'Vendor updated'); } catch (error) { handleAccountingError(error, res, next); }
}

export async function vendorDetailHandler(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try { sendSuccess(res, await service.getVendor(req.params.id)); } catch (error) { handleAccountingError(error, res, next); }
}

export async function listExpensesHandler(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { expenses, total, page, limit } = await service.listExpenses(req);
    sendPaginated(res, expenses, buildPaginationMeta(total, page, limit));
  } catch (error) { next(error); }
}

export async function createExpenseHandler(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const expense = await service.createExpense(req.body, req.user!.id);
    if (req.body.overrideReason) {
      audit(req, 'DUPLICATE_REFERENCE_WARNING_ACKNOWLEDGED', 'Expense', expense.id, { overrideReason: req.body.overrideReason });
    }
    audit(req, 'CREATE', 'Expense', expense.id, expense);
    sendCreated(res, expense, 'Expense recorded');
  } catch (error) { handleAccountingError(error, res, next); }
}

export async function submitExpenseHandler(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try { const expense = await service.submitExpense(req.params.id, req.user!.id); audit(req, 'SUBMIT', 'Expense', expense.id, { status: expense.status }); sendSuccess(res, expense, 'Expense submitted'); } catch (error) { handleAccountingError(error, res, next); }
}

export async function approveExpenseHandler(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try { const expense = await service.approveExpense(req.params.id, req.user!.id); audit(req, 'APPROVE', 'Expense', expense.id, { status: expense.status }); sendSuccess(res, expense, 'Expense approved'); } catch (error) { handleAccountingError(error, res, next); }
}

export async function rejectExpenseHandler(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try { const expense = await service.rejectExpense(req.params.id, req.body.reason, req.user!.id); audit(req, 'REJECT', 'Expense', expense.id, { status: expense.status }); sendSuccess(res, expense, 'Expense rejected'); } catch (error) { handleAccountingError(error, res, next); }
}

export async function payExpenseHandler(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const expense = await service.payExpense(req.params.id, req.body, req.user!.id);
    if (req.body.overrideReason) {
      audit(req, 'DUPLICATE_REFERENCE_WARNING_ACKNOWLEDGED', 'Expense', expense.id, { overrideReason: req.body.overrideReason });
    }
    audit(req, 'PAY', 'Expense', expense.id, { status: expense.status });
    sendSuccess(res, expense, 'Expense paid');
  } catch (error) { handleAccountingError(error, res, next); }
}

export async function voidExpenseHandler(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try { const expense = await service.voidExpense(req.params.id, req.body.reason, req.user!.id); audit(req, 'VOID', 'Expense', expense.id, { status: expense.status }); sendSuccess(res, expense, 'Expense voided'); } catch (error) { handleAccountingError(error, res, next); }
}

export async function remittanceCandidatesHandler(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try { sendSuccess(res, await service.getRemittanceCandidates(req.query.insurerId as string | undefined)); } catch (error) { next(error); }
}

export async function listRemittancesHandler(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { items, total, page, limit } = await service.listInsurerRemittances(req);
    sendPaginated(res, items, buildPaginationMeta(total, page, limit));
  } catch (error) { next(error); }
}

export async function createRemittanceHandler(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try { const remittance = await service.createInsurerRemittance(req.body, req.user!.id); audit(req, 'CREATE', 'InsurerRemittance', remittance.id, remittance); sendCreated(res, remittance, 'Insurer remittance generated'); } catch (error) { handleAccountingError(error, res, next); }
}

export async function payRemittanceHandler(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const remittance = await service.payInsurerRemittance(req.params.id, req.body, req.user!.id);
    if (req.body.overrideReason) {
      audit(req, 'DUPLICATE_REFERENCE_WARNING_ACKNOWLEDGED', 'InsurerRemittance', remittance.id, { overrideReason: req.body.overrideReason });
    }
    audit(req, 'PAY', 'InsurerRemittance', remittance.id, { status: remittance.status });
    sendSuccess(res, remittance, 'Insurer remittance paid');
  } catch (error) { handleAccountingError(error, res, next); }
}

export async function statementUploadsHandler(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try { sendSuccess(res, await service.listStatementUploads(req)); } catch (error) { next(error); }
}

export async function uploadStatementHandler(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try { const upload = await service.uploadStatement(req.body, req.user!.id); audit(req, 'CREATE', 'StatementUpload', upload.id, upload); sendCreated(res, upload, 'Statement uploaded'); } catch (error) { handleAccountingError(error, res, next); }
}

export async function matchReconciliationItemHandler(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const item = await service.matchReconciliationItem(
      req.params.id,
      req.body.financeTransactionId,
      req.user!.id,
      req.body.notes,
      req.body.matchAmount,
    );
    audit(req, 'UPDATE', 'ReconciliationItem', item.id, item);
    sendSuccess(res, item, 'Statement item matched');
  } catch (error) { handleAccountingError(error, res, next); }
}

export async function unlinkReconciliationMatchHandler(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await service.unlinkReconciliationMatch(req.params.id, req.user!.id, req.body.reason);
    audit(req, 'RECON_MATCH_UNLINKED', 'ReconciliationMatch', req.params.id, result);
    sendSuccess(res, result, 'Reconciliation match unlinked');
  } catch (error) { handleAccountingError(error, res, next); }
}

export async function reallocateReconciliationMatchHandler(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await service.reallocateReconciliationMatch(req.params.id, req.body, req.user!.id);
    audit(req, 'RECON_MATCH_REALLOCATED', 'ReconciliationMatch', req.params.id, result);
    sendSuccess(res, result, 'Reconciliation match reallocated');
  } catch (error) { handleAccountingError(error, res, next); }
}

export async function acceptHighConfidenceMatchesHandler(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await service.acceptHighConfidenceMatches(
      req.params.id,
      req.user!.id,
      req.body.preset,
      req.body.minScore,
    );
    audit(req, 'RECON_MATCH_AUTOBATCH_ACCEPTED', 'StatementUpload', req.params.id, result);
    sendSuccess(res, result, `Accepted ${result.accepted} high-confidence matches`);
  } catch (error) { handleAccountingError(error, res, next); }
}

export async function createMissingTransactionFromItemHandler(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await service.createMissingTransactionFromStatementItem(req.params.id, req.body, req.user!.id);
    audit(req, 'RECON_MISSING_TX_CREATED', 'ReconciliationItem', req.params.id, result);
    sendCreated(res, result, result.requireApproval ? 'Missing transaction created and submitted for approval' : 'Missing transaction created and matched');
  } catch (error) { handleAccountingError(error, res, next); }
}

export async function approveMissingTransactionHandler(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await service.approveMissingTransaction(req.params.id, req.user!.id, req.body.comments);
    audit(req, 'RECON_MISSING_TX_APPROVED', 'ApprovalRequest', req.params.id, result);
    sendSuccess(res, result, 'Missing transaction approved');
  } catch (error) { handleAccountingError(error, res, next); }
}

export async function rejectMissingTransactionHandler(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await service.rejectMissingTransaction(req.params.id, req.user!.id, req.body.comments);
    audit(req, 'RECON_MISSING_TX_REJECTED', 'ApprovalRequest', req.params.id, result);
    sendSuccess(res, result, 'Missing transaction rejected');
  } catch (error) { handleAccountingError(error, res, next); }
}

export async function pendingMissingApprovalsHandler(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try { sendSuccess(res, await service.getPendingMissingTransactionApprovals()); } catch (error) { next(error); }
}

export async function requestReopenReconciliationHandler(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await service.requestReopenReconciliation(req.params.id, req.user!.id, req.body);
    audit(req, 'RECON_REOPEN_REQUESTED', 'StatementUpload', req.params.id, result);
    sendCreated(res, result, 'Reopen request submitted for approval');
  } catch (error) { handleAccountingError(error, res, next); }
}

export async function pendingReopenApprovalsHandler(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try { sendSuccess(res, await service.getPendingReopenReconciliationApprovals()); } catch (error) { next(error); }
}

export async function approveReopenReconciliationHandler(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await service.approveReopenReconciliation(req.params.id, req.user!.id, req.body.comments);
    audit(req, 'RECON_REOPEN_APPROVED', 'ApprovalRequest', req.params.id, result);
    sendSuccess(res, result, 'Reconciliation reopened');
  } catch (error) { handleAccountingError(error, res, next); }
}

export async function rejectReopenReconciliationHandler(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await service.rejectReopenReconciliation(req.params.id, req.user!.id, req.body.comments);
    audit(req, 'RECON_REOPEN_REJECTED', 'ApprovalRequest', req.params.id, result);
    sendSuccess(res, result, 'Reopen request rejected');
  } catch (error) { handleAccountingError(error, res, next); }
}

export async function completeReconciliationHandler(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try { const upload = await service.completeReconciliation(req.params.id, req.user!.id); audit(req, 'UPDATE', 'StatementUpload', upload.id, { status: upload.status }); sendSuccess(res, upload, 'Reconciliation completed'); } catch (error) { handleAccountingError(error, res, next); }
}

export async function reverseFinanceTransactionHandler(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await service.reverseFinanceTransaction(req.params.id, req.user!.id, req.body.reason, req.body.voidSourceRecord);
    audit(req, 'REVERSE', 'FinanceTransaction', req.params.id, result);
    sendSuccess(res, result, 'Finance transaction reversed');
  } catch (error) { handleAccountingError(error, res, next); }
}

export async function commissionReceivablesHandler(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { items, total, page, limit } = await service.getCommissionReceivables(req);
    sendPaginated(res, items, buildPaginationMeta(total, page, limit));
  } catch (error) { next(error); }
}

export async function commissionReceivableOptionsHandler(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try { sendSuccess(res, await service.getCommissionReceivableOptions(req.query.insurerId as string)); } catch (error) { handleAccountingError(error, res, next); }
}

export async function recordCommissionReceiptHandler(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const receipt = await service.recordCommissionReceipt(req.body, req.user!.id);
    if (req.body.overrideReason) {
      audit(req, 'DUPLICATE_REFERENCE_WARNING_ACKNOWLEDGED', 'InsurerCommissionReceipt', receipt.id, { overrideReason: req.body.overrideReason });
    }
    audit(req, 'CREATE', 'InsurerCommissionReceipt', receipt.id, receipt);
    sendCreated(res, receipt, 'Commission receipt recorded');
  } catch (error) { handleAccountingError(error, res, next); }
}

export async function agentPayablesHandler(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try { sendSuccess(res, await service.getAgentPayables(req)); } catch (error) { next(error); }
}

export async function payAgentCommissionsHandler(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try { const result = await service.payAgentCommissions(req.body, req.user!.id); audit(req, 'PAY', 'CommissionEntry', req.body.commissionEntryIds.join(','), result); sendSuccess(res, result, 'Agent commissions paid'); } catch (error) { handleAccountingError(error, res, next); }
}

export async function trialBalanceHandler(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try { sendSuccess(res, await service.getTrialBalance()); } catch (error) { next(error); }
}

export async function reportHandler(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try { sendSuccess(res, await service.getReport(req.params.name)); } catch (error) { next(error); }
}
