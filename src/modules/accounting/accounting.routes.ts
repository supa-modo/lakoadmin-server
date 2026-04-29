import { Router } from 'express';
import { authenticateToken } from '../../middleware/auth';
import { requirePermission } from '../../middleware/rbac';
import { validate } from '../../middleware/validate';
import {
  agentPaymentBatchSchema,
  approvalActionSchema,
  acceptHighConfidenceSchema,
  bankAccountSchema,
  commissionReceiptSchema,
  completeReconciliationSchema,
  createMissingTransactionSchema,
  createExpenseSchema,
  createFinancialYearSchema,
  createLedgerAccountSchema,
  createRemittanceSchema,
  journalWorkflowSchema,
  manualJournalSchema,
  mpesaAccountSchema,
  payExpenseSchema,
  payRemittanceSchema,
  reconciliationMatchSchema,
  reverseFinanceTransactionSchema,
  reallocateReconciliationMatchSchema,
  requestReopenReconciliationSchema,
  rejectExpenseSchema,
  statementUploadSchema,
  submitExpenseSchema,
  unlinkReconciliationMatchSchema,
  updateLedgerAccountSchema,
  updatePeriodStatusSchema,
  vendorSchema,
  voidExpenseSchema,
} from './accounting.validation';
import * as controller from './accounting.controller';

const router = Router();

router.use(authenticateToken);

router.get('/dashboard', requirePermission('accounting.dashboard.read'), controller.financeDashboardHandler);

router.get('/chart-of-accounts', requirePermission('accounting.accounts.read'), controller.ledgerAccountsHandler);
router.post('/chart-of-accounts', requirePermission('accounting.chart_of_accounts.manage'), validate(createLedgerAccountSchema), controller.createLedgerAccountHandler);
router.patch('/chart-of-accounts/:id', requirePermission('accounting.chart_of_accounts.manage'), validate(updateLedgerAccountSchema), controller.updateLedgerAccountHandler);
router.delete('/chart-of-accounts/:id', requirePermission('accounting.chart_of_accounts.manage'), controller.deactivateLedgerAccountHandler);
router.get('/chart-of-accounts/:id/ledger', requirePermission('accounting.accounts.read'), controller.accountLedgerHandler);

router.get('/bank-accounts', requirePermission('accounting.accounts.read'), controller.bankAccountsHandler);
router.post('/bank-accounts', requirePermission('accounting.accounts.create'), validate(bankAccountSchema), controller.createBankAccountHandler);
router.patch('/bank-accounts/:id', requirePermission('accounting.accounts.update'), validate(bankAccountSchema.partial()), controller.updateBankAccountHandler);
router.delete('/bank-accounts/:id', requirePermission('accounting.accounts.update'), controller.deactivateBankAccountHandler);

router.get('/mpesa-accounts', requirePermission('accounting.accounts.read'), controller.mpesaAccountsHandler);
router.post('/mpesa-accounts', requirePermission('accounting.accounts.create'), validate(mpesaAccountSchema), controller.createMpesaAccountHandler);
router.patch('/mpesa-accounts/:id', requirePermission('accounting.accounts.update'), validate(mpesaAccountSchema.partial()), controller.updateMpesaAccountHandler);
router.delete('/mpesa-accounts/:id', requirePermission('accounting.accounts.update'), controller.deactivateMpesaAccountHandler);

router.get('/transactions', requirePermission('accounting.transactions.read'), controller.listTransactionsHandler);
router.get('/transactions/:id/reversal-preview', requirePermission('accounting.transactions.read'), controller.financeTransactionReversalPreviewHandler);
router.post('/transactions/:id/reverse', requirePermission('accounting.journals.reverse'), validate(reverseFinanceTransactionSchema), controller.reverseFinanceTransactionHandler);

router.get('/journals', requirePermission('accounting.accounts.read'), controller.listJournalsHandler);
router.post('/journals', requirePermission('accounting.journals.create'), validate(manualJournalSchema), controller.createManualJournalHandler);
router.post('/journals/:id/submit', requirePermission('accounting.journals.create'), validate(journalWorkflowSchema), controller.submitJournalHandler);
router.post('/journals/:id/approve', requirePermission('accounting.journals.approve'), validate(journalWorkflowSchema), controller.approveJournalHandler);
router.post('/journals/:id/post', requirePermission('accounting.journals.post'), validate(journalWorkflowSchema), controller.postJournalHandler);
router.post('/journals/:id/reverse', requirePermission('accounting.journals.reverse'), validate(journalWorkflowSchema), controller.reverseJournalHandler);

router.post('/financial-years', requirePermission('accounting.periods.manage'), validate(createFinancialYearSchema), controller.createFinancialYearHandler);
router.get('/financial-periods', requirePermission('accounting.accounts.read'), controller.listPeriodsHandler);
router.patch('/financial-periods/:id/status', requirePermission('accounting.periods.manage'), validate(updatePeriodStatusSchema), controller.updatePeriodStatusHandler);

router.get('/expenses/categories', requirePermission('accounting.expenses.read'), controller.expenseCategoriesHandler);
router.post('/expenses/categories/defaults', requirePermission('accounting.expenses.create'), controller.seedExpenseCategoriesHandler);
router.get('/expenses', requirePermission('accounting.expenses.read'), controller.listExpensesHandler);
router.post('/expenses', requirePermission('accounting.expenses.create'), validate(createExpenseSchema), controller.createExpenseHandler);
router.post('/expenses/:id/submit', requirePermission('accounting.expenses.create'), validate(submitExpenseSchema), controller.submitExpenseHandler);
router.post('/expenses/:id/approve', requirePermission('accounting.expenses.approve'), controller.approveExpenseHandler);
router.post('/expenses/:id/reject', requirePermission('accounting.expenses.approve'), validate(rejectExpenseSchema), controller.rejectExpenseHandler);
router.post('/expenses/:id/pay', requirePermission('accounting.expenses.pay'), validate(payExpenseSchema), controller.payExpenseHandler);
router.post('/expenses/:id/void', requirePermission('accounting.expenses.approve'), validate(voidExpenseSchema), controller.voidExpenseHandler);

router.get('/vendors', requirePermission('accounting.vendors.manage'), controller.vendorsHandler);
router.post('/vendors', requirePermission('accounting.vendors.manage'), validate(vendorSchema), controller.createVendorHandler);
router.get('/vendors/:id', requirePermission('accounting.vendors.manage'), controller.vendorDetailHandler);
router.patch('/vendors/:id', requirePermission('accounting.vendors.manage'), validate(vendorSchema.partial()), controller.updateVendorHandler);

router.get('/remittances/candidates', requirePermission('accounting.remittances.manage'), controller.remittanceCandidatesHandler);
router.get('/remittances', requirePermission('accounting.remittances.manage'), controller.listRemittancesHandler);
router.post('/remittances', requirePermission('accounting.remittances.manage'), validate(createRemittanceSchema), controller.createRemittanceHandler);
router.post('/remittances/:id/pay', requirePermission('accounting.remittances.manage'), validate(payRemittanceSchema), controller.payRemittanceHandler);

router.get('/reconciliation/statements', requirePermission('accounting.reconciliation.manage'), controller.statementUploadsHandler);
router.post('/reconciliation/statements', requirePermission('accounting.reconciliation.manage'), validate(statementUploadSchema), controller.uploadStatementHandler);
router.post('/reconciliation/items/:id/match', requirePermission('accounting.reconciliation.manage'), validate(reconciliationMatchSchema), controller.matchReconciliationItemHandler);
router.post('/reconciliation/matches/:id/unlink', requirePermission('accounting.reconciliation.manage'), validate(unlinkReconciliationMatchSchema), controller.unlinkReconciliationMatchHandler);
router.patch('/reconciliation/matches/:id/reallocate', requirePermission('accounting.reconciliation.manage'), validate(reallocateReconciliationMatchSchema), controller.reallocateReconciliationMatchHandler);
router.post('/reconciliation/statements/:id/accept-high-confidence', requirePermission('accounting.reconciliation.manage'), validate(acceptHighConfidenceSchema), controller.acceptHighConfidenceMatchesHandler);
router.post('/reconciliation/items/:id/create-transaction', requirePermission('accounting.reconciliation.manage'), validate(createMissingTransactionSchema), controller.createMissingTransactionFromItemHandler);
router.get('/reconciliation/approvals/pending', requirePermission('accounting.journals.approve'), controller.pendingMissingApprovalsHandler);
router.post('/reconciliation/approvals/:id/approve', requirePermission('accounting.journals.approve'), validate(approvalActionSchema), controller.approveMissingTransactionHandler);
router.post('/reconciliation/approvals/:id/reject', requirePermission('accounting.journals.approve'), validate(approvalActionSchema), controller.rejectMissingTransactionHandler);
router.post('/reconciliation/statements/:id/request-reopen', requirePermission('accounting.reconciliation.manage'), validate(requestReopenReconciliationSchema), controller.requestReopenReconciliationHandler);
router.get('/reconciliation/reopen-approvals/pending', requirePermission('accounting.journals.approve'), controller.pendingReopenApprovalsHandler);
router.post('/reconciliation/reopen-approvals/:id/approve', requirePermission('accounting.journals.approve'), validate(approvalActionSchema), controller.approveReopenReconciliationHandler);
router.post('/reconciliation/reopen-approvals/:id/reject', requirePermission('accounting.journals.approve'), validate(approvalActionSchema), controller.rejectReopenReconciliationHandler);
router.post('/reconciliation/statements/:id/complete', requirePermission('accounting.reconciliation.manage'), validate(completeReconciliationSchema), controller.completeReconciliationHandler);

router.get('/commission-receivables', requirePermission('accounting.commission_receivables.manage'), controller.commissionReceivablesHandler);
router.get('/commission-receivables/options', requirePermission('accounting.commission_receivables.manage'), controller.commissionReceivableOptionsHandler);
router.post('/commission-receivables/receipts', requirePermission('accounting.commission_receivables.manage'), validate(commissionReceiptSchema), controller.recordCommissionReceiptHandler);

router.get('/agent-payables', requirePermission('accounting.agent_payables.manage'), controller.agentPayablesHandler);
router.post('/agent-payables/pay', requirePermission('accounting.agent_payables.manage'), validate(agentPaymentBatchSchema), controller.payAgentCommissionsHandler);

router.get('/reports/trial-balance', requirePermission('accounting.reports.read'), controller.trialBalanceHandler);
router.get('/reports/:name', requirePermission('accounting.reports.read'), controller.reportHandler);

export default router;
