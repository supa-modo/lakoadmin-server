import { Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { prisma } from '../../config/database';
import { AuthRequest } from '../../types/express';
import { ensureChartOfAccounts, postJournal, SYSTEM_ACCOUNTS } from './postingEngine.service';
import { recordBrokerPaymentInTransaction } from '../payments/payments.service';
import {
  AgentPaymentBatchInput,
  BankAccountInput,
  CommissionReceiptInput,
  CreateMissingTransactionInput,
  CreateExpenseInput,
  CreateFinancialYearInput,
  CreateLedgerAccountInput,
  CreateRemittanceInput,
  ManualJournalInput,
  MpesaAccountInput,
  PayExpenseInput,
  PayRemittanceInput,
  ReallocateReconciliationMatchInput,
  RequestReopenReconciliationInput,
  StatementUploadInput,
  UnlinkReconciliationMatchInput,
  UpdatePeriodStatusInput,
  VendorInput,
  ReconciliationPreset,
} from './accounting.validation';

type Tx = Prisma.TransactionClient;

export class DuplicateReferenceWarningError extends Error {
  public readonly details: Record<string, unknown>;

  constructor(message: string, details: Record<string, unknown>) {
    super(message);
    this.name = 'DuplicateReferenceWarningError';
    this.details = details;
  }
}

export class FinanceValidationError extends Error {
  public readonly code: string;
  public readonly details: Record<string, unknown>;

  constructor(message: string, code: string, details: Record<string, unknown>) {
    super(message);
    this.name = 'FinanceValidationError';
    this.code = code;
    this.details = details;
  }
}

function decimal(value: number | string | Decimal | null | undefined): Decimal {
  if (value instanceof Decimal) return value;
  return new Decimal(value ?? 0);
}

function asNumber(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function normalizeRef(value?: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed.toUpperCase() : null;
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function determineMatchLevel(score: number): 'HIGH' | 'MEDIUM' | 'LOW' {
  if (score >= 0.9) return 'HIGH';
  if (score >= 0.7) return 'MEDIUM';
  return 'LOW';
}

function calculateRunningBalanceDelta(isDebit: boolean, amount: Decimal): Decimal {
  return isDebit ? amount.negated() : amount;
}

async function nextNumber(
  model: 'expense' | 'insurerRemittance' | 'financeTransaction' | 'insurerCommissionReceipt',
  field: 'expenseNumber' | 'remittanceNumber' | 'transactionNumber' | 'receiptNumber',
  prefix: string,
  tx: Tx | typeof prisma = prisma,
): Promise<string> {
  const year = new Date().getFullYear();
  const startsWith = `${prefix}-${year}-`;
  const count = await (tx[model] as any).count({ where: { [field]: { startsWith } } });
  return `${startsWith}${String(count + 1).padStart(6, '0')}`;
}

function accountCodeForPayment(method?: string | null, trust = false): string {
  if (method === 'MPESA') return trust ? SYSTEM_ACCOUNTS.MPESA_TRUST : SYSTEM_ACCOUNTS.MPESA_OPERATING;
  return trust ? SYSTEM_ACCOUNTS.BANK_TRUST : SYSTEM_ACCOUNTS.BANK_OPERATING;
}

async function createFinanceTransaction(tx: Tx, input: {
  type: string;
  transactionDate?: Date;
  description: string;
  reference?: string | null;
  amount: number | string | Decimal;
  currency?: string;
  direction: 'INFLOW' | 'OUTFLOW' | 'NON_CASH';
  bankAccountId?: string | null;
  mpesaAccountId?: string | null;
  journalEntryId?: string | null;
  paymentId?: string | null;
  directInsurerPaymentId?: string | null;
  commissionEntryId?: string | null;
  insurerCommissionReceiptId?: string | null;
  remittanceId?: string | null;
  expenseId?: string | null;
  agentId?: string | null;
  insurerId?: string | null;
  clientId?: string | null;
  policyId?: string | null;
  documentId?: string | null;
  notes?: string | null;
  userId?: string | null;
}) {
  const transaction = await tx.financeTransaction.create({
    data: {
      transactionNumber: await nextNumber('financeTransaction', 'transactionNumber', 'FTX', tx),
      type: input.type as any,
      transactionDate: input.transactionDate ?? new Date(),
      description: input.description,
      reference: input.reference ?? null,
      amount: decimal(input.amount),
      currency: input.currency ?? 'KES',
      direction: input.direction,
      bankAccountId: input.bankAccountId ?? null,
      mpesaAccountId: input.mpesaAccountId ?? null,
      journalEntryId: input.journalEntryId ?? null,
      paymentId: input.paymentId ?? null,
      directInsurerPaymentId: input.directInsurerPaymentId ?? null,
      commissionEntryId: input.commissionEntryId ?? null,
      insurerCommissionReceiptId: input.insurerCommissionReceiptId ?? null,
      remittanceId: input.remittanceId ?? null,
      expenseId: input.expenseId ?? null,
      agentId: input.agentId ?? null,
      insurerId: input.insurerId ?? null,
      clientId: input.clientId ?? null,
      policyId: input.policyId ?? null,
      documentId: input.documentId ?? null,
      notes: input.notes ?? null,
      createdById: input.userId ?? null,
    },
  });

  const amount = decimal(input.amount);
  const increment = input.direction === 'OUTFLOW' ? amount.negated() : input.direction === 'INFLOW' ? amount : new Decimal(0);
  if (!increment.eq(0) && input.bankAccountId) {
    await tx.bankAccount.update({ where: { id: input.bankAccountId }, data: { currentBalance: { increment } } });
  }
  if (!increment.eq(0) && input.mpesaAccountId) {
    await tx.mpesaAccount.update({ where: { id: input.mpesaAccountId }, data: { currentBalance: { increment } } });
  }

  return transaction;
}

async function checkDuplicateReference(
  tx: Tx,
  input: {
    module: 'expense' | 'remittance' | 'commissionReceipt';
    reference?: string | null;
    amount?: Decimal | number | string | null;
    date?: Date;
    overrideReason?: string | null;
    excludeId?: string;
  },
) {
  const reference = normalizeRef(input.reference);
  if (!reference) return;
  const anchorDate = input.date ?? new Date();
  const startDate = addDays(anchorDate, -30);
  const endDate = addDays(anchorDate, 30);
  const amount = input.amount == null ? null : decimal(input.amount);

  let conflicts: any[] = [];
  if (input.module === 'expense') {
    conflicts = await tx.expense.findMany({
      where: {
        id: input.excludeId ? { not: input.excludeId } : undefined,
        paymentReference: reference,
        ...(amount && { totalAmount: amount }),
        expenseDate: { gte: startDate, lte: endDate },
        deletedAt: null,
      },
      select: { id: true, expenseNumber: true, expenseDate: true, totalAmount: true, paymentReference: true, status: true },
      take: 10,
    });
  } else if (input.module === 'remittance') {
    conflicts = await tx.insurerRemittance.findMany({
      where: {
        id: input.excludeId ? { not: input.excludeId } : undefined,
        paymentReference: reference,
        ...(amount && {
          OR: [
            { paidAmount: amount },
            { netRemittanceAmount: amount },
          ],
        }),
        remittanceDate: { gte: startDate, lte: endDate },
        deletedAt: null,
      },
      select: { id: true, remittanceNumber: true, remittanceDate: true, netRemittanceAmount: true, paymentReference: true, status: true },
      take: 10,
    });
  } else {
    conflicts = await tx.insurerCommissionReceipt.findMany({
      where: {
        id: input.excludeId ? { not: input.excludeId } : undefined,
        reference,
        ...(amount && { amount }),
        receivedDate: { gte: startDate, lte: endDate },
      },
      select: { id: true, receiptNumber: true, receivedDate: true, amount: true, reference: true, method: true },
      take: 10,
    });
  }

  if (conflicts.length > 0 && !input.overrideReason) {
    throw new DuplicateReferenceWarningError('Duplicate reference detected', {
      module: input.module,
      reference,
      conflicts,
      resolution: 'Provide overrideReason to proceed',
    });
  }
}

async function scoreMatch(
  tx: Tx,
  row: {
    transactionDate: Date;
    reference?: string | null;
    amount: Decimal;
    isDebit: boolean;
  },
  context: {
    bankAccountId?: string | null;
    mpesaAccountId?: string | null;
    preset: ReconciliationPreset;
    onlyUnreconciled?: boolean;
  },
) {
  const dateWindowDays = context.preset === 'STRICT' ? 1 : 3;
  const ref = normalizeRef(row.reference);
  const start = addDays(row.transactionDate, -dateWindowDays);
  const end = addDays(row.transactionDate, dateWindowDays);
  const expectedDirection = row.isDebit ? 'OUTFLOW' : 'INFLOW';
  const minAmount = row.amount.mul(0.2);
  const maxAmount = row.amount.mul(5);
  const candidates = await tx.financeTransaction.findMany({
    where: {
      deletedAt: null,
      amount: { gte: minAmount, lte: maxAmount },
      direction: expectedDirection as any,
      transactionDate: { gte: start, lte: end },
      ...(context.onlyUnreconciled && { reconciliationStatus: { in: ['UNMATCHED', 'UNRECONCILED', 'DISPUTED', 'PARTIALLY_MATCHED'] as any } }),
      ...(context.bankAccountId && { bankAccountId: context.bankAccountId }),
      ...(context.mpesaAccountId && { mpesaAccountId: context.mpesaAccountId }),
    },
    orderBy: { transactionDate: 'asc' },
    take: 25,
  });

  let best: { score: number; tx: any } | null = null;
  for (const candidate of candidates) {
    let score = 0.5;
    const diffDays = Math.abs(Math.floor((candidate.transactionDate.getTime() - row.transactionDate.getTime()) / 86400000));
    score += context.preset === 'STRICT'
      ? diffDays === 0 ? 0.2 : 0.1
      : diffDays <= 1 ? 0.2 : diffDays <= 2 ? 0.15 : 0.1;

    if (ref && normalizeRef(candidate.reference) === ref) {
      score += 0.3;
    } else if (ref && candidate.reference && normalizeRef(candidate.reference)?.includes(ref.slice(0, 6))) {
      score += 0.15;
    } else if (!ref && context.preset === 'RELAXED') {
      score += 0.05;
    } else if (context.preset === 'STRICT') {
      score -= 0.1;
    }

    const candidateAmount = decimal(candidate.amount);
    const ratio = row.amount.gte(candidateAmount)
      ? candidateAmount.div(row.amount)
      : row.amount.div(candidateAmount);
    const ratioScore = asNumber(ratio);
    if (ratioScore >= 0.95) score += 0.25;
    else if (ratioScore >= 0.75) score += 0.15;
    else if (ratioScore >= 0.5) score += 0.08;
    else score -= 0.08;

    score = Math.max(0, Math.min(1, score));
    if (!best || score > best.score) best = { score, tx: candidate };
  }
  if (!best) return null;

  const level = determineMatchLevel(best.score);
  return {
    candidate: best.tx,
    score: best.score,
    level,
  };
}

async function assertOpenFinancialPeriodForPosting(tx: Tx, postingDate: Date, context: string): Promise<void> {
  const period = await tx.financialPeriod.findFirst({
    where: {
      startDate: { lte: postingDate },
      endDate: { gte: postingDate },
    },
  });
  if (!period) return;
  if (period.status !== 'OPEN') {
    throw new FinanceValidationError(
      `Cannot post into ${period.status.toLowerCase()} period ${period.name}`,
      'FINANCIAL_PERIOD_BLOCKED',
      {
        postingDate: postingDate.toISOString(),
        financialPeriodId: period.id,
        financialPeriodName: period.name,
        financialPeriodStatus: period.status,
        context,
      },
    );
  }
}

async function assertReopenAllowedByPeriod(
  tx: Tx,
  statement: { id: string; periodEnd: Date },
  context: string,
): Promise<void> {
  const period = await tx.financialPeriod.findFirst({
    where: {
      startDate: { lte: statement.periodEnd },
      endDate: { gte: statement.periodEnd },
    },
  });
  if (!period) return;
  if (period.status !== 'OPEN') {
    throw new FinanceValidationError(
      `Cannot reopen reconciliation for statement period in ${period.status.toLowerCase()} financial period ${period.name}`,
      'RECON_REOPEN_PERIOD_BLOCKED',
      {
        statementUploadId: statement.id,
        financialPeriodId: period.id,
        financialPeriodName: period.name,
        financialPeriodStatus: period.status,
        context,
      },
    );
  }
}

async function getItemMatchedAmount(tx: Tx, reconciliationItemId: string): Promise<Decimal> {
  const aggregate = await (tx as any).reconciliationMatch.aggregate({
    where: { reconciliationItemId },
    _sum: { matchedAmount: true },
  });
  return aggregate._sum.matchedAmount ?? new Decimal(0);
}

async function getTransactionMatchedAmount(tx: Tx, financeTransactionId: string): Promise<Decimal> {
  const aggregate = await (tx as any).reconciliationMatch.aggregate({
    where: { financeTransactionId },
    _sum: { matchedAmount: true },
  });
  return aggregate._sum.matchedAmount ?? new Decimal(0);
}

function ensureStatementEditable(statementStatus: string) {
  if (statementStatus === 'COMPLETED' || statementStatus === 'REVIEWED') {
    throw new FinanceValidationError(
      'Cannot change matches on a completed/reviewed reconciliation statement. Re-open period workflow is required.',
      'RECON_STATEMENT_LOCKED',
      {
        statementStatus,
      },
    );
  }
}

function validateTransactionMatchCompatibility(
  item: { isDebit: boolean; statementUpload: { bankAccountId?: string | null; mpesaAccountId?: string | null } },
  financeTransaction: { direction: string; bankAccountId?: string | null; mpesaAccountId?: string | null },
) {
  const expectedDirection = item.isDebit ? 'OUTFLOW' : 'INFLOW';
  if (financeTransaction.direction !== expectedDirection) {
    throw new FinanceValidationError(
      'Manual match direction mismatch',
      'RECON_MANUAL_MATCH_DIRECTION_MISMATCH',
      {
        expectedDirection,
        transactionDirection: financeTransaction.direction,
      },
    );
  }
  if (item.statementUpload.bankAccountId && financeTransaction.bankAccountId !== item.statementUpload.bankAccountId) {
    throw new FinanceValidationError(
      'Manual match bank account mismatch',
      'RECON_MANUAL_MATCH_ACCOUNT_MISMATCH',
      {
        expectedBankAccountId: item.statementUpload.bankAccountId,
        transactionBankAccountId: financeTransaction.bankAccountId,
      },
    );
  }
  if (item.statementUpload.mpesaAccountId && financeTransaction.mpesaAccountId !== item.statementUpload.mpesaAccountId) {
    throw new FinanceValidationError(
      'Manual match M-Pesa account mismatch',
      'RECON_MANUAL_MATCH_ACCOUNT_MISMATCH',
      {
        expectedMpesaAccountId: item.statementUpload.mpesaAccountId,
        transactionMpesaAccountId: financeTransaction.mpesaAccountId,
      },
    );
  }
}

function deriveItemMatchStatus(totalAmount: Decimal, matchedAmount: Decimal): 'UNMATCHED' | 'PARTIALLY_MATCHED' | 'MATCHED' {
  if (matchedAmount.lte(0)) return 'UNMATCHED';
  if (matchedAmount.gte(totalAmount)) return 'MATCHED';
  return 'PARTIALLY_MATCHED';
}

function deriveTransactionMatchStatus(totalAmount: Decimal, matchedAmount: Decimal): 'UNMATCHED' | 'PARTIALLY_MATCHED' | 'MATCHED' {
  if (matchedAmount.lte(0)) return 'UNMATCHED';
  if (matchedAmount.gte(totalAmount)) return 'MATCHED';
  return 'PARTIALLY_MATCHED';
}

async function refreshReconciliationItemStatus(tx: Tx, reconciliationItemId: string, matchedById?: string): Promise<void> {
  const item: any = await tx.reconciliationItem.findUnique({
    where: { id: reconciliationItemId },
    include: { matches: true },
  } as any);
  if (!item) return;
  const matchedAmount = item.matches.reduce((sum: Decimal, match: any) => sum.plus(match.matchedAmount), new Decimal(0));
  const status = deriveItemMatchStatus(decimal(item.amount), matchedAmount);
  const exactSingleMatch = status === 'MATCHED' && item.matches.length === 1 ? item.matches[0] : null;
  const highestConfidence = item.matches.reduce((max: number, match: any) => {
    const current = asNumber(match.matchConfidence);
    return current > max ? current : max;
  }, 0);
  await tx.reconciliationItem.update({
    where: { id: reconciliationItemId },
    data: {
      matchStatus: status as any,
      matchedFinanceTransactionId: exactSingleMatch?.financeTransactionId ?? null,
      matchConfidence: item.matches.length > 0 ? new Decimal(highestConfidence.toFixed(2)) : null,
      matchedAt: item.matches.length > 0 ? new Date() : null,
      matchedById: item.matches.length > 0 ? matchedById ?? item.matchedById : null,
    },
  });
}

async function refreshFinanceTransactionStatus(tx: Tx, financeTransactionId: string, matchedById?: string): Promise<void> {
  const financeTransaction = await tx.financeTransaction.findUnique({ where: { id: financeTransactionId } });
  if (!financeTransaction) return;
  const matchedAmount = await getTransactionMatchedAmount(tx, financeTransactionId);
  const status = deriveTransactionMatchStatus(decimal(financeTransaction.amount), matchedAmount);
  await tx.financeTransaction.update({
    where: { id: financeTransactionId },
    data: {
      reconciliationStatus: status as any,
      reconciledById: status !== 'UNMATCHED' ? matchedById ?? financeTransaction.reconciledById : null,
      reconciledAt: status !== 'UNMATCHED' ? financeTransaction.reconciledAt ?? new Date() : null,
    },
  });
}

async function refreshStatementMatchCounts(tx: Tx, statementUploadId: string): Promise<void> {
  const counts = await tx.reconciliationItem.groupBy({
    by: ['matchStatus'],
    where: { statementUploadId },
    _count: true,
  });
  const matchedCount = counts
    .filter((row) => ['MATCHED', 'MANUALLY_MATCHED', 'RECONCILED'].includes(row.matchStatus))
    .reduce((sum, row) => sum + row._count, 0);
  const total = counts.reduce((sum, row) => sum + row._count, 0);
  await tx.statementUpload.update({
    where: { id: statementUploadId },
    data: {
      matchedCount,
      unmatchedCount: Math.max(0, total - matchedCount),
      status: matchedCount > 0 ? 'IN_PROGRESS' : 'UPLOADED',
    },
  });
}

function resolveCashAccountCode(input: { bankAccount?: { accountType?: string | null } | null; mpesaAccount?: { accountType?: string | null } | null }) {
  const isMpesa = Boolean(input.mpesaAccount);
  const accountType = (input.mpesaAccount?.accountType ?? input.bankAccount?.accountType ?? '').toUpperCase();
  const isTrust = accountType.includes('TRUST');
  if (isMpesa) return isTrust ? SYSTEM_ACCOUNTS.MPESA_TRUST : SYSTEM_ACCOUNTS.MPESA_OPERATING;
  return isTrust ? SYSTEM_ACCOUNTS.BANK_TRUST : SYSTEM_ACCOUNTS.BANK_OPERATING;
}

function resolvePaymentMethod(input: { mpesaAccount?: unknown; paymentMethod?: string | null }) {
  if (input.paymentMethod) return input.paymentMethod;
  return input.mpesaAccount ? 'MPESA' : 'BANK_TRANSFER';
}

async function ensureUncategorizedExpenseCategory(tx: Tx) {
  const existing = await tx.expenseCategory.findFirst({
    where: { code: 'UNCATEGORIZED_RECON_EXPENSE' },
  });
  if (existing) return existing;
  const expenseLedger = await tx.ledgerAccount.findUnique({
    where: { code: SYSTEM_ACCOUNTS.OPERATING_EXPENSES },
  });
  return tx.expenseCategory.create({
    data: {
      name: 'Uncategorized Reconciliation Expense',
      code: 'UNCATEGORIZED_RECON_EXPENSE',
      ledgerAccountId: expenseLedger?.id ?? null,
      description: 'Auto category used when posting expenses from bank reconciliation',
      isActive: true,
    },
  });
}

async function postAndCreateMissingFinanceArtifacts(
  tx: Tx,
  params: {
    item: any;
    data: CreateMissingTransactionInput;
    userId: string;
    bankAccount: any | null;
    mpesaAccount: any | null;
  },
) {
  const { item, data, userId, bankAccount, mpesaAccount } = params;
  const amount = decimal(item.amount);
  const paymentMethod = resolvePaymentMethod({ mpesaAccount, paymentMethod: (data as any).paymentMethod });
  const cashAccountCode = resolveCashAccountCode({ bankAccount, mpesaAccount });
  const sourceMode = (data as any).sourceMode ?? 'CREATE_SOURCE_RECORD';

  let journalEntry: any = null;
  let expenseId: string | null = null;
  let remittanceId: string | null = null;
  let insurerCommissionReceiptId: string | null = null;
  let insurerId: string | null = data.insurerId ?? null;
  let commissionEntryId: string | null = data.commissionEntryId ?? null;

  if (data.direction === 'NON_CASH') {
    throw new Error('Statement-derived transactions must be cash inflow/outflow');
  }

  if (sourceMode === 'CREATE_SOURCE_RECORD' && data.transactionType === 'BROKER_PREMIUM_PAYMENT') {
    if (!data.clientId) throw new Error('Client is required for broker premium payment creation');
    if (!data.policyId && !data.invoiceId) throw new Error('Policy or invoice allocation target is required');
    const brokerPaymentPayload = {
      clientId: data.clientId,
      amount: Number(amount),
      currency: 'KES',
      premiumCollectionMode: 'BROKER_COLLECTED',
      method: paymentMethod as any,
      reference: data.reference ?? item.reference ?? null,
      transactionCode: paymentMethod === 'MPESA' ? (data.reference ?? item.reference ?? `RECON-${item.id.slice(0, 8)}`) : null,
      paymentDate: item.transactionDate.toISOString(),
      receivedDate: item.transactionDate.toISOString(),
      bankAccountId: bankAccount?.id ?? null,
      mpesaAccountId: mpesaAccount?.id ?? null,
      notes: data.notes ?? null,
      autoVerify: true,
      allocations: [
        {
          policyId: data.policyId ?? null,
          invoiceId: data.invoiceId ?? null,
          amount: Number(amount),
          notes: 'Created from reconciliation',
        },
      ],
    };
    const paymentId = await recordBrokerPaymentInTransaction(tx, brokerPaymentPayload as any, userId);
    const brokerFinanceTransaction = await tx.financeTransaction.findFirst({
      where: { paymentId },
      orderBy: { createdAt: 'desc' },
    });
    if (!brokerFinanceTransaction) {
      throw new Error('Broker premium payment created but finance transaction linkage is missing');
    }
    return brokerFinanceTransaction;
  } else if (sourceMode === 'CREATE_SOURCE_RECORD' && data.transactionType === 'EXPENSE_PAYMENT') {
    const category = data.expenseCategoryId
      ? await tx.expenseCategory.findUnique({ where: { id: data.expenseCategoryId } })
      : await ensureUncategorizedExpenseCategory(tx);
    if (!category) throw new Error('Expense category not found');
    const categoryAccount = category.ledgerAccountId ? await tx.ledgerAccount.findUnique({ where: { id: category.ledgerAccountId } }) : null;
    const taxAmount = decimal((data as any).taxAmount ?? 0);
    if (taxAmount.gt(amount)) throw new Error('Tax amount cannot exceed statement amount');
    const baseAmount = amount.minus(taxAmount);
    const expense = await tx.expense.create({
      data: {
        expenseNumber: await nextNumber('expense', 'expenseNumber', 'EXP', tx),
        vendorId: data.vendorId ?? null,
        categoryId: category.id,
        expenseDate: item.transactionDate,
        dueDate: null,
        description: data.description,
        amount: baseAmount,
        taxAmount,
        totalAmount: amount,
        currency: 'KES',
        status: 'PAID',
        paymentMethod: paymentMethod as any,
        paymentReference: data.reference ?? item.reference ?? null,
        paidAt: item.transactionDate,
        paidById: userId,
        payImmediately: true,
        bankAccountId: bankAccount?.id ?? null,
        mpesaAccountId: mpesaAccount?.id ?? null,
        notes: data.notes ?? null,
        createdById: userId,
      },
    });
    expenseId = expense.id;
    journalEntry = await postJournal(tx, {
      event: 'EXPENSE_PAID',
      entryDate: item.transactionDate,
      description: data.description,
      reference: data.reference ?? item.reference ?? expense.expenseNumber,
      source: { expenseId: expense.id },
      sourceKey: `recon-expense-paid:${expense.id}`,
      userId,
      lines: [
        { accountCode: categoryAccount?.code ?? SYSTEM_ACCOUNTS.OPERATING_EXPENSES, debit: amount },
        { accountCode: cashAccountCode, credit: amount },
      ],
    });
  } else if (sourceMode === 'CREATE_SOURCE_RECORD' && data.transactionType === 'INSURER_REMITTANCE') {
    if (!data.remittanceId) throw new Error('Remittance ID is required');
    const remittance = await tx.insurerRemittance.findUnique({ where: { id: data.remittanceId } });
    if (!remittance) throw new Error('Insurer remittance not found');
    const remaining = remittance.netRemittanceAmount.minus(remittance.paidAmount);
    if (amount.gt(remaining)) throw new Error('Statement amount exceeds remittance balance');
    insurerId = remittance.insurerId;
    remittanceId = remittance.id;
    journalEntry = await postJournal(tx, {
      event: 'INSURER_REMITTANCE_PAID',
      entryDate: item.transactionDate,
      description: data.description,
      reference: data.reference ?? item.reference ?? remittance.remittanceNumber,
      source: { remittanceId: remittance.id, insurerId: remittance.insurerId },
      sourceKey: `recon-remittance-paid:${remittance.id}:${remittance.paidAmount.plus(amount).toFixed(2)}`,
      userId,
      lines: [
        { accountCode: SYSTEM_ACCOUNTS.INSURER_PAYABLE, debit: amount },
        { accountCode: cashAccountCode, credit: amount },
      ],
    });
    const updatedPaidAmount = remittance.paidAmount.plus(amount);
    await tx.insurerRemittance.update({
      where: { id: remittance.id },
      data: {
        paidAmount: updatedPaidAmount,
        paymentMethod: paymentMethod as any,
        paymentReference: data.reference ?? item.reference ?? remittance.paymentReference,
        paidAt: item.transactionDate,
        paidById: userId,
        status: updatedPaidAmount.gte(remittance.netRemittanceAmount) ? 'PAID' : 'PARTIALLY_PAID',
      },
    });
  } else if (sourceMode === 'CREATE_SOURCE_RECORD' && data.transactionType === 'INSURER_COMMISSION_RECEIPT') {
    if (!data.insurerId) throw new Error('Insurer is required');
    const receipt = await tx.insurerCommissionReceipt.create({
      data: {
        receiptNumber: await nextNumber('insurerCommissionReceipt', 'receiptNumber', 'ICR', tx),
        insurerId: data.insurerId,
        commissionEntryId: data.commissionEntryId ?? null,
        amount,
        currency: 'KES',
        receivedDate: item.transactionDate,
        method: paymentMethod as any,
        reference: data.reference ?? item.reference ?? null,
        notes: data.notes ?? null,
        createdById: userId,
      },
    });
    insurerCommissionReceiptId = receipt.id;
    journalEntry = await postJournal(tx, {
      event: 'INSURER_COMMISSION_RECEIVED',
      entryDate: item.transactionDate,
      description: data.description,
      reference: data.reference ?? item.reference,
      source: { insurerId: data.insurerId, commissionEntryId: data.commissionEntryId ?? undefined },
      sourceKey: `recon-insurer-commission-receipt:${receipt.id}`,
      userId,
      lines: [
        { accountCode: cashAccountCode, debit: amount },
        { accountCode: SYSTEM_ACCOUNTS.COMMISSION_RECEIVABLE_INSURERS, credit: amount },
      ],
    });
    if (data.commissionEntryId) {
      const entry = await tx.commissionEntry.findUnique({ where: { id: data.commissionEntryId } });
      if (entry) {
        const received = entry.commissionReceivedAmount.plus(amount);
        commissionEntryId = entry.id;
        await tx.commissionEntry.update({
          where: { id: entry.id },
          data: {
            commissionReceivedAmount: received,
            insurerCommissionStatus: received.gte(entry.commissionReceivableAmount) ? 'RECEIVED' : 'PARTIALLY_RECEIVED',
          },
        });
      }
    }
  } else {
    if (sourceMode === 'CREATE_SOURCE_RECORD' && ['DIRECT_INSURER_ACKNOWLEDGEMENT', 'AGENT_COMMISSION_PAYMENT', 'REFUND', 'JOURNAL_ADJUSTMENT', 'OPENING_BALANCE'].includes(data.transactionType)) {
      throw new Error(`Create-source-record is not supported for ${data.transactionType}. Use FINANCE_ONLY or use the dedicated module workflow.`);
    }
    const financeOnlyLines = (() => {
      if (data.transactionType === 'BANK_CHARGE') {
        return [
          { accountCode: SYSTEM_ACCOUNTS.BANK_CHARGES, debit: amount },
          { accountCode: cashAccountCode, credit: amount },
        ];
      }
      if (data.transactionType === 'MPESA_CHARGE') {
        return [
          { accountCode: SYSTEM_ACCOUNTS.MPESA_CHARGES, debit: amount },
          { accountCode: cashAccountCode, credit: amount },
        ];
      }
      if (data.direction === 'INFLOW') {
        return [
          { accountCode: cashAccountCode, debit: amount },
          { accountCode: SYSTEM_ACCOUNTS.OTHER_INCOME, credit: amount },
        ];
      }
      return [
        { accountCode: SYSTEM_ACCOUNTS.OPERATING_EXPENSES, debit: amount },
        { accountCode: cashAccountCode, credit: amount },
      ];
    })();

    journalEntry = await postJournal(tx, {
      event: 'MANUAL_JOURNAL_POSTED',
      entryDate: item.transactionDate,
      description: data.description,
      reference: data.reference ?? item.reference,
      source: { insurerId: data.insurerId ?? undefined, clientId: data.clientId ?? undefined, policyId: data.policyId ?? undefined, commissionEntryId: data.commissionEntryId ?? undefined },
      sourceKey: `recon-finance-only:${item.id}:${data.transactionType}`,
      userId,
      lines: financeOnlyLines as any,
    });
  }

  return createFinanceTransaction(tx, {
    type: data.transactionType,
    transactionDate: item.transactionDate,
    description: data.description,
    reference: data.reference ?? item.reference ?? null,
    amount,
    direction: data.direction,
    bankAccountId: bankAccount?.id ?? null,
    mpesaAccountId: mpesaAccount?.id ?? null,
    journalEntryId: journalEntry?.id ?? null,
    expenseId,
    remittanceId,
    commissionEntryId: commissionEntryId ?? data.commissionEntryId ?? null,
    insurerCommissionReceiptId,
    insurerId,
    clientId: data.clientId ?? null,
    policyId: data.policyId ?? null,
    notes: data.notes ?? null,
    userId,
  });
}

export async function getFinanceDashboard() {
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const [
    bankAccounts,
    mpesaAccounts,
    receivables,
    agentPayable,
    expenses,
    transactions,
    recentTransactions,
    pendingReconciliations,
    expenseApprovals,
    unallocatedPayments,
    upcomingRemittances,
    overdueReceivables,
  ] = await Promise.all([
    prisma.bankAccount.findMany({ where: { deletedAt: null, isActive: true } }),
    prisma.mpesaAccount.findMany({ where: { deletedAt: null, isActive: true } }),
    prisma.commissionEntry.aggregate({
      where: { insurerCommissionStatus: { in: ['RECEIVABLE', 'PARTIALLY_RECEIVED', 'OVERDUE'] } },
      _sum: { commissionReceivableAmount: true, commissionReceivedAmount: true },
    }),
    prisma.commissionEntry.aggregate({ where: { status: { in: ['APPROVED', 'PAYABLE', 'HELD'] } }, _sum: { netCommission: true } }),
    prisma.expense.aggregate({
      where: { status: { in: ['APPROVED', 'PAID'] }, expenseDate: { gte: monthStart } },
      _sum: { totalAmount: true },
      _count: true,
    }),
    prisma.financeTransaction.findMany({
      where: { deletedAt: null, transactionDate: { gte: new Date(monthStart.getFullYear(), monthStart.getMonth() - 5, 1) } },
      orderBy: { transactionDate: 'asc' },
      include: { bankAccount: true, mpesaAccount: true },
    }),
    prisma.financeTransaction.findMany({ where: { deletedAt: null }, orderBy: { transactionDate: 'desc' }, take: 8 }),
    prisma.statementUpload.findMany({ where: { status: { in: ['UPLOADED', 'IN_PROGRESS'] } }, orderBy: { createdAt: 'desc' }, take: 6, include: { bankAccount: true, mpesaAccount: true } }),
    prisma.expense.findMany({ where: { status: 'SUBMITTED' }, orderBy: { submittedAt: 'asc' }, take: 6, include: { vendor: true, category: true } }),
    prisma.payment.findMany({ where: { status: { in: ['PENDING', 'VERIFIED'] }, allocations: { none: {} } }, orderBy: { paymentDate: 'desc' }, take: 6, include: { client: true } }),
    prisma.insurerRemittance.findMany({ where: { status: { in: ['DRAFT', 'APPROVED', 'PARTIALLY_PAID'] } }, orderBy: { dueDate: 'asc' }, take: 6, include: { insurer: true } }),
    prisma.commissionEntry.findMany({ where: { insurerCommissionStatus: { in: ['OVERDUE', 'RECEIVABLE', 'PARTIALLY_RECEIVED'] } }, orderBy: { earnedDate: 'asc' }, take: 6, include: { insurer: true, policy: true } }),
  ]);

  const bankBalance = bankAccounts.reduce((sum, account) => sum + asNumber(account.currentBalance), 0);
  const mpesaBalance = mpesaAccounts.reduce((sum, account) => sum + asNumber(account.currentBalance), 0);
  const trustBalance = [...bankAccounts, ...mpesaAccounts].filter((a) => a.accountType.includes('TRUST')).reduce((sum, account) => sum + asNumber(account.currentBalance), 0);
  const operatingBalance = [...bankAccounts, ...mpesaAccounts].filter((a) => a.accountType.includes('OPERATING')).reduce((sum, account) => sum + asNumber(account.currentBalance), 0);
  const commissionReceivable = decimal(receivables._sum.commissionReceivableAmount).minus(decimal(receivables._sum.commissionReceivedAmount));
  const insurerPayables = await prisma.ledgerAccount.findUnique({ where: { code: SYSTEM_ACCOUNTS.INSURER_PAYABLE } });
  const premiumTrust = await prisma.ledgerAccount.findUnique({ where: { code: SYSTEM_ACCOUNTS.PREMIUM_TRUST_LIABILITY } });

  const monthly = new Map<string, any>();
  for (let i = 5; i >= 0; i -= 1) {
    const d = new Date(monthStart.getFullYear(), monthStart.getMonth() - i, 1);
    monthly.set(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, {
      month: d.toLocaleString('en-US', { month: 'short' }),
      inflow: 0,
      outflow: 0,
      premium: 0,
      commission: 0,
      expenses: 0,
      profit: 0,
    });
  }
  transactions.forEach((tx) => {
    const d = new Date(tx.transactionDate);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const row = monthly.get(key);
    if (!row) return;
    const amount = asNumber(tx.amount);
    if (tx.direction === 'INFLOW') row.inflow += amount;
    if (tx.direction === 'OUTFLOW') row.outflow += amount;
    if (tx.type === 'BROKER_PREMIUM_PAYMENT') row.premium += amount;
    if (tx.type === 'INSURER_COMMISSION_RECEIPT') row.commission += amount;
    if (tx.type === 'EXPENSE_PAYMENT') row.expenses += amount;
    row.profit = row.commission - row.expenses;
  });

  const expenseBreakdown = await prisma.expense.groupBy({
    by: ['categoryId'],
    where: { status: { in: ['APPROVED', 'PAID'] }, expenseDate: { gte: monthStart } },
    _sum: { totalAmount: true },
  });
  const categories = await prisma.expenseCategory.findMany({ where: { id: { in: expenseBreakdown.map((row) => row.categoryId) } } });

  return {
    summary: {
      totalCashPosition: bankBalance + mpesaBalance,
      trustAccountBalance: trustBalance,
      operatingAccountBalance: operatingBalance,
      mpesaBalance,
      bankBalance,
      outstandingPremiums: asNumber(premiumTrust?.currentBalance),
      insurerPayables: asNumber(insurerPayables?.currentBalance),
      commissionReceivables: asNumber(commissionReceivable),
      agentCommissionPayables: asNumber(agentPayable._sum.netCommission),
      monthlyIncome: Array.from(monthly.values()).at(-1)?.commission ?? 0,
      monthlyExpenses: asNumber(expenses._sum.totalAmount),
      netPosition: operatingBalance + asNumber(commissionReceivable) - asNumber(agentPayable._sum.netCommission),
    },
    charts: {
      cashFlow: Array.from(monthly.values()),
      premiumCollections: Array.from(monthly.values()).map((row) => ({ month: row.month, premium: row.premium })),
      commissionIncome: Array.from(monthly.values()).map((row) => ({ month: row.month, commission: row.commission })),
      expenseBreakdown: expenseBreakdown.map((row) => ({
        name: categories.find((category) => category.id === row.categoryId)?.name ?? 'Uncategorised',
        value: asNumber(row._sum.totalAmount),
      })),
      accountDistribution: [
        { name: 'Bank', value: bankBalance },
        { name: 'M-Pesa', value: mpesaBalance },
        { name: 'Trust', value: trustBalance },
        { name: 'Operating', value: operatingBalance },
      ],
      profitLoss: Array.from(monthly.values()).map((row) => ({ month: row.month, income: row.commission, expenses: row.expenses, net: row.profit })),
      insurerPayablesAging: await getInsurerPayablesAging(),
      commissionReceivablesAging: await getCommissionReceivablesAging(),
    },
    widgets: {
      recentTransactions,
      pendingReconciliations,
      expenseApprovals,
      unallocatedPayments,
      upcomingRemittances,
      overdueReceivables,
    },
  };
}

export async function listLedgerAccounts() {
  await prisma.$transaction((tx) => ensureChartOfAccounts(tx));
  return prisma.ledgerAccount.findMany({ orderBy: { code: 'asc' }, include: { parent: true } });
}

export async function createLedgerAccount(data: CreateLedgerAccountInput) {
  return prisma.ledgerAccount.create({
    data: {
      code: data.code,
      name: data.name,
      type: data.type as any,
      subtype: data.subtype as any,
      parentId: data.parentId ?? null,
      description: data.description ?? null,
    },
  });
}

export async function updateLedgerAccount(id: string, data: Partial<CreateLedgerAccountInput>) {
  const account = await prisma.ledgerAccount.findUnique({ where: { id }, include: { entries: true } });
  if (!account) throw new Error('Ledger account not found');
  if (account.isSystemAccount && (data.code || data.type)) throw new Error('System account code/type cannot be changed');
  return prisma.ledgerAccount.update({
    where: { id },
    data: {
      code: data.code,
      name: data.name,
      type: data.type as any,
      subtype: data.subtype as any,
      parentId: data.parentId,
      description: data.description,
    },
  });
}

export async function deactivateLedgerAccount(id: string) {
  const account = await prisma.ledgerAccount.findUnique({ where: { id }, include: { entries: true } });
  if (!account) throw new Error('Ledger account not found');
  if (account.isSystemAccount) throw new Error('System account cannot be deactivated');
  if (account.entries.length > 0) throw new Error('Ledger account is already used and cannot be deleted');
  return prisma.ledgerAccount.update({ where: { id }, data: { isActive: false } });
}

export async function getAccountLedger(id: string) {
  const account = await prisma.ledgerAccount.findUnique({
    where: { id },
    include: { entries: { include: { journalEntry: true }, orderBy: { journalEntry: { entryDate: 'desc' } } } },
  });
  if (!account) throw new Error('Ledger account not found');
  return account;
}

export async function listBankAccounts() {
  return prisma.bankAccount.findMany({ where: { deletedAt: null }, orderBy: [{ isActive: 'desc' }, { accountName: 'asc' }] });
}

export async function createBankAccount(data: BankAccountInput) {
  return prisma.bankAccount.create({
    data: {
      ...data,
      currentBalance: decimal(data.currentBalance ?? data.openingBalance),
      openingBalance: decimal(data.openingBalance),
    },
  });
}

export async function updateBankAccount(id: string, data: Partial<BankAccountInput>) {
  const account = await prisma.bankAccount.findUnique({ where: { id } });
  if (!account) throw new Error('Bank account not found');
  return prisma.bankAccount.update({ where: { id }, data: data as any });
}

export async function deactivateBankAccount(id: string) {
  const account = await prisma.bankAccount.findUnique({ where: { id } });
  if (!account) throw new Error('Bank account not found');
  return prisma.bankAccount.update({ where: { id }, data: { isActive: false, deletedAt: new Date() } });
}

export async function listMpesaAccounts() {
  return prisma.mpesaAccount.findMany({ where: { deletedAt: null }, orderBy: [{ isActive: 'desc' }, { accountName: 'asc' }] });
}

export async function createMpesaAccount(data: MpesaAccountInput) {
  return prisma.mpesaAccount.create({
    data: {
      ...data,
      currentBalance: decimal(data.currentBalance ?? data.openingBalance),
      openingBalance: decimal(data.openingBalance),
    },
  });
}

export async function updateMpesaAccount(id: string, data: Partial<MpesaAccountInput>) {
  const account = await prisma.mpesaAccount.findUnique({ where: { id } });
  if (!account) throw new Error('M-Pesa account not found');
  return prisma.mpesaAccount.update({ where: { id }, data: data as any });
}

export async function deactivateMpesaAccount(id: string) {
  const account = await prisma.mpesaAccount.findUnique({ where: { id } });
  if (!account) throw new Error('M-Pesa account not found');
  return prisma.mpesaAccount.update({ where: { id }, data: { isActive: false, deletedAt: new Date() } });
}

export async function listFinanceTransactions(req: AuthRequest) {
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(100, parseInt(req.query.limit as string) || 30);
  const skip = (page - 1) * limit;
  const q = String(req.query.q ?? '').trim();
  const dateFrom = req.query.dateFrom ? new Date(String(req.query.dateFrom)) : null;
  const dateTo = req.query.dateTo ? new Date(String(req.query.dateTo)) : null;
  const transactionDate =
    dateFrom || dateTo
      ? {
          ...(dateFrom ? { gte: dateFrom } : {}),
          ...(dateTo ? { lte: dateTo } : {}),
        }
      : undefined;
  const where: Prisma.FinanceTransactionWhereInput = {
    deletedAt: null,
    ...(req.query.type && { type: req.query.type as any }),
    ...(req.query.status && { status: req.query.status as any }),
    ...(req.query.accountId && { OR: [{ bankAccountId: req.query.accountId as string }, { mpesaAccountId: req.query.accountId as string }] }),
    ...(req.query.reconciliationStatus && { reconciliationStatus: req.query.reconciliationStatus as any }),
    ...(req.query.direction && { direction: req.query.direction as any }),
    ...(req.query.clientId && { clientId: req.query.clientId as string }),
    ...(req.query.insurerId && { insurerId: req.query.insurerId as string }),
    ...(req.query.agentId && { agentId: req.query.agentId as string }),
    ...(transactionDate && { transactionDate }),
    ...(q
      ? {
          OR: [
            { transactionNumber: { contains: q, mode: 'insensitive' } },
            { description: { contains: q, mode: 'insensitive' } },
            { reference: { contains: q, mode: 'insensitive' } },
            { bankAccount: { accountName: { contains: q, mode: 'insensitive' } } },
            { mpesaAccount: { accountName: { contains: q, mode: 'insensitive' } } },
          ],
        }
      : {}),
  };
  const [transactions, total] = await Promise.all([
    prisma.financeTransaction.findMany({
      where,
      skip,
      take: limit,
      orderBy: { transactionDate: 'desc' },
      include: { bankAccount: true, mpesaAccount: true, journalEntry: true },
    }),
    prisma.financeTransaction.count({ where }),
  ]);
  return { transactions, total, page, limit };
}

export async function listJournalEntries(req: AuthRequest) {
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(100, parseInt(req.query.limit as string) || 20);
  const skip = (page - 1) * limit;
  const [entries, total] = await Promise.all([
    prisma.journalEntry.findMany({
      skip,
      take: limit,
      orderBy: { entryDate: 'desc' },
      include: { lines: { include: { account: true } }, financialPeriod: true },
    }),
    prisma.journalEntry.count(),
  ]);
  return { entries, total, page, limit };
}

export async function createManualJournal(data: ManualJournalInput, userId: string) {
  return prisma.journalEntry.create({
    data: {
      entryNumber: `JE-DRAFT-${Date.now()}`,
      entryDate: new Date(data.entryDate),
      description: data.description,
      reference: data.reference ?? null,
      notes: data.notes ?? null,
      totalDebit: data.lines.reduce((sum, line) => sum.plus(line.debit ?? 0), new Decimal(0)),
      totalCredit: data.lines.reduce((sum, line) => sum.plus(line.credit ?? 0), new Decimal(0)),
      status: 'DRAFT',
      createdById: userId,
      lines: {
        create: await Promise.all(data.lines.map(async (line) => {
          const account = await prisma.ledgerAccount.findUnique({ where: { code: line.accountCode } });
          if (!account) throw new Error(`Ledger account ${line.accountCode} is not configured`);
          return {
            accountId: account.id,
            debit: decimal(line.debit),
            credit: decimal(line.credit),
            description: line.description ?? data.description,
          };
        })),
      },
    },
    include: { lines: true },
  });
}

export async function submitJournal(id: string) {
  const journal = await prisma.journalEntry.findUnique({ where: { id } });
  if (!journal) throw new Error('Journal entry not found');
  if (!decimal(journal.totalDebit).eq(journal.totalCredit)) throw new Error('Journal is not balanced');
  if (journal.status !== 'DRAFT') throw new Error('Only draft journals can be submitted');
  return prisma.journalEntry.update({ where: { id }, data: { status: 'SUBMITTED' as any } });
}

export async function approveJournal(id: string, userId: string) {
  const journal = await prisma.journalEntry.findUnique({ where: { id } });
  if (!journal) throw new Error('Journal entry not found');
  if (!['SUBMITTED', 'PENDING_APPROVAL'].includes(journal.status)) throw new Error('Only submitted journals can be approved');
  return prisma.journalEntry.update({ where: { id }, data: { status: 'APPROVED', approvedAt: new Date(), approvedById: userId } });
}

export async function postManualJournal(id: string, userId: string) {
  return prisma.$transaction(async (tx) => {
    const journal = await tx.journalEntry.findUnique({ where: { id }, include: { lines: { include: { account: true } } } });
    if (!journal) throw new Error('Journal entry not found');
    if (journal.status !== 'APPROVED') throw new Error('Only approved journals can be posted');
    const posted = await postJournal(tx, {
      event: 'MANUAL_JOURNAL_POSTED',
      entryDate: journal.entryDate,
      description: journal.description,
      reference: journal.reference,
      userId,
      sourceKey: `manual-journal:${journal.id}`,
      lines: journal.lines.map((line) => ({ accountCode: line.account.code, debit: line.debit, credit: line.credit, description: line.description ?? undefined })),
    });
    await tx.journalEntry.update({ where: { id }, data: { status: 'VOIDED' as any, notes: `Posted as ${posted.entryNumber}` } });
    return posted;
  });
}

export async function reverseJournal(id: string, userId: string) {
  return prisma.$transaction(async (tx) => {
    const journal = await tx.journalEntry.findUnique({ where: { id }, include: { lines: { include: { account: true } } } });
    if (!journal) throw new Error('Journal entry not found');
    if (journal.status !== 'POSTED') throw new Error('Only posted journals can be reversed');
    const reversal = await postJournal(tx, {
      event: 'MANUAL_JOURNAL_POSTED',
      entryDate: new Date(),
      description: `Reversal of ${journal.entryNumber}: ${journal.description}`,
      reference: journal.reference,
      userId,
      sourceKey: `journal-reversal:${journal.id}`,
      lines: journal.lines.map((line) => ({ accountCode: line.account.code, debit: line.credit, credit: line.debit, description: `Reversal: ${line.description ?? journal.description}` })),
    });
    await tx.journalEntry.update({ where: { id }, data: { status: 'REVERSED' } });
    return reversal;
  });
}

export async function reverseFinanceTransaction(
  financeTransactionId: string,
  userId: string,
  reason: string,
  voidSourceRecord = true,
) {
  return prisma.$transaction(async (tx) => {
    const transaction = await tx.financeTransaction.findUnique({
      where: { id: financeTransactionId },
      include: { journalEntry: true },
    });
    if (!transaction) throw new Error('Finance transaction not found');
    if (transaction.status === 'REVERSED' || transaction.status === 'VOIDED') {
      throw new Error('Finance transaction is already reversed/voided');
    }
    if (transaction.reconciliationStatus === 'RECONCILED') {
      throw new FinanceValidationError(
        'Cannot reverse a reconciled transaction without first unlinking reconciliation matches',
        'REVERSE_BLOCKED_RECONCILED',
        { financeTransactionId, reconciliationStatus: transaction.reconciliationStatus },
      );
    }
    if (!transaction.journalEntryId) {
      throw new Error('Finance transaction has no journal entry to reverse');
    }
    const originalJournal = await tx.journalEntry.findUnique({
      where: { id: transaction.journalEntryId },
      include: { lines: { include: { account: true } } },
    });
    if (!originalJournal) throw new Error('Original journal entry not found');
    if (originalJournal.status !== 'POSTED') throw new Error('Only posted journals can be reversed');
    await assertOpenFinancialPeriodForPosting(tx, new Date(), 'transaction:reverse');
    const reversingJournal = await postJournal(tx, {
      event: 'MANUAL_JOURNAL_POSTED',
      entryDate: new Date(),
      description: `Reversal of ${originalJournal.entryNumber}: ${originalJournal.description}`,
      reference: originalJournal.reference,
      userId,
      sourceKey: `recon-transaction-reversal:${transaction.id}`,
      source: {
        paymentId: originalJournal.paymentId ?? undefined,
        policyId: originalJournal.policyId ?? undefined,
        insurerId: originalJournal.insurerId ?? undefined,
        clientId: originalJournal.clientId ?? undefined,
        commissionEntryId: originalJournal.commissionEntryId ?? undefined,
        remittanceId: originalJournal.remittanceId ?? undefined,
        expenseId: originalJournal.expenseId ?? undefined,
        agentId: originalJournal.agentId ?? undefined,
      },
      lines: originalJournal.lines.map((line) => ({
        accountCode: line.account.code,
        debit: line.credit,
        credit: line.debit,
        description: `Reversal: ${line.description ?? originalJournal.description}`,
      })),
    });
    await tx.journalEntry.update({ where: { id: originalJournal.id }, data: { status: 'REVERSED' } });
    const reverseDirection = transaction.direction === 'INFLOW'
      ? 'OUTFLOW'
      : transaction.direction === 'OUTFLOW'
        ? 'INFLOW'
        : 'NON_CASH';

    const reversingTx = await createFinanceTransaction(tx, {
      type: transaction.type,
      transactionDate: new Date(),
      description: `Reversal of ${transaction.transactionNumber}: ${reason}`,
      reference: transaction.reference,
      amount: transaction.amount,
      direction: reverseDirection,
      bankAccountId: transaction.bankAccountId,
      mpesaAccountId: transaction.mpesaAccountId,
      journalEntryId: reversingJournal.id,
      paymentId: transaction.paymentId,
      directInsurerPaymentId: transaction.directInsurerPaymentId,
      commissionEntryId: transaction.commissionEntryId,
      insurerCommissionReceiptId: transaction.insurerCommissionReceiptId,
      remittanceId: transaction.remittanceId,
      expenseId: transaction.expenseId,
      agentId: transaction.agentId,
      insurerId: transaction.insurerId,
      clientId: transaction.clientId,
      policyId: transaction.policyId,
      notes: `Reversal of ${transaction.transactionNumber}. Reason: ${reason}`,
      userId,
    });

    await tx.financeTransaction.update({
      where: { id: financeTransactionId },
      data: {
        status: 'REVERSED',
        notes: `${transaction.notes ?? ''}${transaction.notes ? ' | ' : ''}Reversed by ${reversingTx.transactionNumber}. Reason: ${reason}`,
      },
    });

    if (transaction.expenseId && voidSourceRecord) {
      await tx.expense.update({
        where: { id: transaction.expenseId },
        data: {
          status: 'VOIDED',
          voidReason: `Reconciliation reversal: ${reason}`,
          voidedAt: new Date(),
          voidedById: userId,
          paidAt: null,
          paidById: null,
        },
      });
    }

    if (transaction.remittanceId && voidSourceRecord) {
      const remittance = await tx.insurerRemittance.findUnique({ where: { id: transaction.remittanceId } });
      if (remittance) {
        const nextPaidAmount = remittance.paidAmount.minus(transaction.amount);
        await tx.insurerRemittance.update({
          where: { id: remittance.id },
          data: {
            status: nextPaidAmount.lte(0) ? 'APPROVED' : 'PARTIALLY_PAID',
            paidAmount: nextPaidAmount.lte(0) ? new Decimal(0) : nextPaidAmount,
            notes: `${remittance.notes ?? ''}${remittance.notes ? ' | ' : ''}Reversed payment ${transaction.transactionNumber}: ${reason}`,
          },
        });
      }
    }

    if (transaction.insurerCommissionReceiptId && voidSourceRecord) {
      const receipt = await tx.insurerCommissionReceipt.findUnique({ where: { id: transaction.insurerCommissionReceiptId } });
      if (receipt) {
        await tx.insurerCommissionReceipt.delete({ where: { id: receipt.id } });
      }
      if (transaction.commissionEntryId) {
        const entry = await tx.commissionEntry.findUnique({ where: { id: transaction.commissionEntryId } });
        if (entry) {
          const nextReceived = entry.commissionReceivedAmount.minus(transaction.amount);
          await tx.commissionEntry.update({
            where: { id: entry.id },
            data: {
              commissionReceivedAmount: nextReceived.lte(0) ? new Decimal(0) : nextReceived,
              insurerCommissionStatus: nextReceived.lte(0)
                ? 'RECEIVABLE'
                : nextReceived.gte(entry.commissionReceivableAmount)
                  ? 'RECEIVED'
                  : 'PARTIALLY_RECEIVED',
            },
          });
        }
      }
    }

    const linkedMatches = await (tx as any).reconciliationMatch.findMany({
      where: { financeTransactionId },
      select: { reconciliationItemId: true, statementUploadId: true },
    });
    if (linkedMatches.length > 0) {
      const uniqueStatementIds = Array.from(new Set(linkedMatches.map((match: any) => match.statementUploadId))) as string[];
      for (const statementId of uniqueStatementIds) {
        const statement = await tx.statementUpload.findUnique({ where: { id: statementId } });
        if (statement) ensureStatementEditable(statement.status);
      }
      await (tx as any).reconciliationMatch.deleteMany({ where: { financeTransactionId } });
      const uniqueItemIds = Array.from(new Set(linkedMatches.map((match: any) => match.reconciliationItemId))) as string[];
      for (const itemId of uniqueItemIds) {
        await refreshReconciliationItemStatus(tx, itemId, userId);
      }
      for (const statementId of uniqueStatementIds) {
        await refreshStatementMatchCounts(tx, statementId);
      }
    }
    await refreshFinanceTransactionStatus(tx, financeTransactionId, userId);
    return {
      originalTransactionId: financeTransactionId,
      reversingTransactionId: reversingTx.id,
      reversingJournalId: reversingJournal.id,
    };
  });
}

export async function getFinanceTransactionReversalPreview(financeTransactionId: string, voidSourceRecord = true) {
  const transaction = await prisma.financeTransaction.findUnique({
    where: { id: financeTransactionId },
  });
  if (!transaction) throw new Error('Finance transaction not found');
  const [bankAccount, mpesaAccount, journalEntry, expense, remittance, insurerCommissionReceipt] = await Promise.all([
    transaction.bankAccountId ? prisma.bankAccount.findUnique({ where: { id: transaction.bankAccountId } }) : Promise.resolve(null),
    transaction.mpesaAccountId ? prisma.mpesaAccount.findUnique({ where: { id: transaction.mpesaAccountId } }) : Promise.resolve(null),
    transaction.journalEntryId
      ? prisma.journalEntry.findUnique({ where: { id: transaction.journalEntryId }, include: { lines: { include: { account: true } } } })
      : Promise.resolve(null),
    transaction.expenseId ? prisma.expense.findUnique({ where: { id: transaction.expenseId } }) : Promise.resolve(null),
    transaction.remittanceId ? prisma.insurerRemittance.findUnique({ where: { id: transaction.remittanceId } }) : Promise.resolve(null),
    transaction.insurerCommissionReceiptId
      ? prisma.insurerCommissionReceipt.findUnique({ where: { id: transaction.insurerCommissionReceiptId } })
      : Promise.resolve(null),
  ]);
  if (!journalEntry) throw new Error('Finance transaction has no journal entry to reverse');
  if (journalEntry.status !== 'POSTED') throw new Error('Only posted transactions can be reversed');

  const linkedMatches = await (prisma as any).reconciliationMatch.findMany({
    where: { financeTransactionId },
    include: {
      reconciliationItem: {
        select: {
          id: true,
          description: true,
          transactionDate: true,
          statementUploadId: true,
          statementUpload: { select: { id: true, fileName: true, status: true } },
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  });

  let periodBlock: Record<string, unknown> | null = null;
  try {
    await prisma.$transaction(async (tx) => {
      await assertOpenFinancialPeriodForPosting(tx, new Date(), 'transaction:reverse-preview');
    });
  } catch (error) {
    if ((error as any)?.name === 'FinanceValidationError') {
      periodBlock = {
        code: (error as any).code,
        message: (error as Error).message,
        details: (error as any).details,
      };
    } else {
      throw error;
    }
  }

  return {
    transaction: {
      id: transaction.id,
      transactionNumber: transaction.transactionNumber,
      type: transaction.type,
      status: transaction.status,
      reconciliationStatus: transaction.reconciliationStatus,
      transactionDate: transaction.transactionDate,
      description: transaction.description,
      reference: transaction.reference,
      amount: Number(transaction.amount),
      direction: transaction.direction,
      accountName: bankAccount?.accountName ?? mpesaAccount?.accountName ?? 'Non-cash',
    },
    checks: {
      canReverse: !periodBlock && !['REVERSED', 'VOIDED'].includes(transaction.status) && transaction.reconciliationStatus !== 'RECONCILED',
      periodBlock,
      reconciledBlock: transaction.reconciliationStatus === 'RECONCILED',
    },
    journalImpact: {
      original: {
        id: journalEntry.id,
        entryNumber: journalEntry.entryNumber,
        entryDate: journalEntry.entryDate,
        status: journalEntry.status,
      },
      reversingLines: journalEntry.lines.map((line: any) => ({
        accountCode: line.account.code,
        accountName: line.account.name,
        debit: Number(line.credit),
        credit: Number(line.debit),
        description: line.description ?? journalEntry?.description ?? transaction.description,
      })),
    },
    sourceImpact: {
      voidSourceRecord,
      expense: expense
        ? {
          id: expense.id,
          expenseNumber: expense.expenseNumber,
          currentStatus: expense.status,
          nextStatus: voidSourceRecord ? 'VOIDED' : expense.status,
        }
        : null,
      remittance: remittance
        ? {
          id: remittance.id,
          remittanceNumber: remittance.remittanceNumber,
          currentStatus: remittance.status,
          currentPaidAmount: Number(remittance.paidAmount),
          predictedPaidAmount: voidSourceRecord
            ? Math.max(0, Number(remittance.paidAmount.minus(transaction.amount)))
            : Number(remittance.paidAmount),
        }
        : null,
      insurerCommissionReceipt: insurerCommissionReceipt
        ? {
          id: insurerCommissionReceipt.id,
          receiptNumber: insurerCommissionReceipt.receiptNumber,
          receivedDate: insurerCommissionReceipt.receivedDate,
          amount: Number(insurerCommissionReceipt.amount),
          action: voidSourceRecord ? 'DELETE_RECEIPT_AND_ADJUST_RECEIVABLE' : 'NO_SOURCE_CHANGE',
        }
        : null,
    },
    reconciliationImpact: {
      linkedMatchCount: linkedMatches.length,
      linkedMatches: linkedMatches.map((match: any) => ({
        matchId: match.id,
        matchedAmount: Number(match.matchedAmount),
        statementId: match.reconciliationItem.statementUploadId,
        statementName: match.reconciliationItem.statementUpload?.fileName ?? null,
        statementStatus: match.reconciliationItem.statementUpload?.status ?? null,
        reconciliationItemId: match.reconciliationItem.id,
        reconciliationItemDescription: match.reconciliationItem.description,
        reconciliationItemDate: match.reconciliationItem.transactionDate,
      })),
    },
  };
}

export async function createFinancialYear(data: CreateFinancialYearInput) {
  const startDate = new Date(data.startDate);
  return prisma.financialYear.create({
    data: {
      name: `FY ${data.year}`,
      year: data.year,
      startDate,
      endDate: new Date(data.endDate),
      periods: {
        create: Array.from({ length: 12 }, (_, index) => {
          const periodStart = new Date(startDate);
          periodStart.setMonth(startDate.getMonth() + index, 1);
          const periodEnd = new Date(periodStart);
          periodEnd.setMonth(periodStart.getMonth() + 1, 0);
          return { name: `${data.year}-${String(index + 1).padStart(2, '0')}`, month: index + 1, startDate: periodStart, endDate: periodEnd };
        }),
      },
    },
    include: { periods: true },
  });
}

export async function listFinancialPeriods() {
  return prisma.financialPeriod.findMany({ include: { financialYear: true }, orderBy: [{ startDate: 'desc' }] });
}

export async function updateFinancialPeriodStatus(id: string, data: UpdatePeriodStatusInput, userId: string) {
  const period = await prisma.financialPeriod.findUnique({ where: { id } });
  if (!period) throw new Error('Financial period not found');
  return prisma.financialPeriod.update({
    where: { id },
    data: {
      status: data.status as any,
      ...(data.status === 'LOCKED' && { lockedById: userId, lockedAt: new Date() }),
      ...(data.status === 'CLOSED' && { closedById: userId, closedAt: new Date() }),
    },
  });
}

export async function listExpenseCategories() {
  return prisma.expenseCategory.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } });
}

export async function createDefaultExpenseCategories() {
  const categories = [
    ['BANK', 'Bank Charges', SYSTEM_ACCOUNTS.BANK_CHARGES],
    ['MPESA', 'M-Pesa Charges', SYSTEM_ACCOUNTS.MPESA_CHARGES],
    ['OPS', 'Operating Expenses', SYSTEM_ACCOUNTS.OPERATING_EXPENSES],
    ['MARKETING', 'Marketing Expenses', SYSTEM_ACCOUNTS.MARKETING_EXPENSES],
    ['SALARIES', 'Salaries', SYSTEM_ACCOUNTS.SALARIES],
    ['RENT', 'Rent', SYSTEM_ACCOUNTS.RENT],
    ['UTILITIES', 'Utilities', SYSTEM_ACCOUNTS.UTILITIES],
    ['INTERNET', 'Internet', SYSTEM_ACCOUNTS.UTILITIES],
    ['SOFTWARE', 'Software/Hosting', SYSTEM_ACCOUNTS.SOFTWARE_HOSTING],
    ['TRANSPORT', 'Transport', SYSTEM_ACCOUNTS.TRANSPORT],
    ['SUPPLIES', 'Office Supplies', SYSTEM_ACCOUNTS.OFFICE_SUPPLIES],
    ['PROFESSIONAL', 'Professional Fees', SYSTEM_ACCOUNTS.PROFESSIONAL_FEES],
    ['MISC', 'Miscellaneous', SYSTEM_ACCOUNTS.OPERATING_EXPENSES],
  ];
  await prisma.$transaction(async (tx) => {
    await ensureChartOfAccounts(tx);
    for (const [code, name, ledgerCode] of categories) {
      const account = await tx.ledgerAccount.findUnique({ where: { code: ledgerCode } });
      await tx.expenseCategory.upsert({
        where: { name },
        update: { code, ledgerAccountId: account?.id },
        create: { name, code, ledgerAccountId: account?.id },
      });
    }
  });
  return listExpenseCategories();
}

export async function listVendors(req: AuthRequest) {
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(200, Math.max(10, parseInt(req.query.limit as string) || 30));
  const skip = (page - 1) * limit;
  const status = req.query.status as string | undefined;
  const vendorType = req.query.vendorType as string | undefined;
  const q = String(req.query.q ?? '').trim();
  const where: Prisma.VendorWhereInput = {
    deletedAt: null,
    ...(status && { status: status as any }),
    ...(vendorType && { vendorType }),
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: 'insensitive' } },
            { contactPerson: { contains: q, mode: 'insensitive' } },
            { email: { contains: q, mode: 'insensitive' } },
            { phone: { contains: q, mode: 'insensitive' } },
            { kraPin: { contains: q, mode: 'insensitive' } },
            { paymentTerms: { contains: q, mode: 'insensitive' } },
          ],
        }
      : {}),
  };
  const [items, total] = await Promise.all([
    prisma.vendor.findMany({
      where,
      skip,
      take: limit,
      orderBy: { name: 'asc' },
      include: { expenses: { take: 5, orderBy: { expenseDate: 'desc' } } },
    }),
    prisma.vendor.count({ where }),
  ]);
  return { items, total, page, limit };
}

export async function createVendor(data: VendorInput) {
  return prisma.vendor.create({ data: { ...data, isActive: data.status !== 'ARCHIVED' } as any });
}

export async function updateVendor(id: string, data: Partial<VendorInput>) {
  const vendor = await prisma.vendor.findUnique({ where: { id } });
  if (!vendor) throw new Error('Vendor not found');
  return prisma.vendor.update({ where: { id }, data: { ...data, isActive: data.status ? data.status !== 'ARCHIVED' : undefined } as any });
}

export async function getVendor(id: string) {
  const vendor = await prisma.vendor.findUnique({ where: { id }, include: { expenses: { include: { category: true }, orderBy: { expenseDate: 'desc' } } } });
  if (!vendor) throw new Error('Vendor not found');
  return vendor;
}

export async function listExpenses(req: AuthRequest) {
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(100, parseInt(req.query.limit as string) || 20);
  const skip = (page - 1) * limit;
  const status = req.query.status as string | undefined;
  const where: Prisma.ExpenseWhereInput = { deletedAt: null, ...(status && { status: status as any }) };
  const [expenses, total] = await Promise.all([
    prisma.expense.findMany({ where, skip, take: limit, orderBy: { expenseDate: 'desc' }, include: { vendor: true, category: true } }),
    prisma.expense.count({ where }),
  ]);
  return { expenses, total, page, limit };
}

export async function createExpense(data: CreateExpenseInput, userId: string) {
  return prisma.$transaction(async (tx) => {
    if (data.paymentReference) {
      await checkDuplicateReference(tx, {
        module: 'expense',
        reference: data.paymentReference,
        amount: decimal(data.amount).plus(data.taxAmount ?? 0),
        date: new Date(data.expenseDate),
        overrideReason: data.overrideReason,
      });
    }
    const totalAmount = decimal(data.amount).plus(data.taxAmount ?? 0);
    const expense = await tx.expense.create({
      data: {
        expenseNumber: await nextNumber('expense', 'expenseNumber', 'EXP', tx),
        vendorId: data.vendorId ?? null,
        categoryId: data.categoryId,
        expenseDate: new Date(data.expenseDate),
        dueDate: data.dueDate ? new Date(data.dueDate) : null,
        description: data.description,
        amount: decimal(data.amount),
        taxAmount: decimal(data.taxAmount ?? 0),
        totalAmount,
        currency: data.currency,
        receiptDocumentId: data.receiptDocumentId ?? null,
        bankAccountId: data.bankAccountId ?? null,
        mpesaAccountId: data.mpesaAccountId ?? null,
        paymentMethod: data.paymentMethod as any,
        paymentReference: data.paymentReference ?? null,
        payImmediately: data.payImmediately,
        notes: data.notes ?? null,
        status: data.payImmediately ? 'PAID' : 'DRAFT',
        paidAt: data.payImmediately ? new Date(data.expenseDate) : null,
        paidById: data.payImmediately ? userId : null,
        createdById: userId,
      },
      include: { category: true },
    });

    if (data.payImmediately) {
      const categoryAccount = expense.category.ledgerAccountId
        ? await tx.ledgerAccount.findUnique({ where: { id: expense.category.ledgerAccountId } })
        : null;
      const entry = await postJournal(tx, {
        event: 'EXPENSE_PAID',
        entryDate: new Date(data.expenseDate),
        description: expense.description,
        reference: data.paymentReference,
        source: { expenseId: expense.id },
        sourceKey: `expense-paid:${expense.id}`,
        userId,
        lines: [
          { accountCode: categoryAccount?.code ?? SYSTEM_ACCOUNTS.OPERATING_EXPENSES, debit: expense.totalAmount },
          { accountCode: accountCodeForPayment(data.paymentMethod), credit: expense.totalAmount },
        ],
      });
      await createFinanceTransaction(tx, {
        type: 'EXPENSE_PAYMENT',
        transactionDate: new Date(data.expenseDate),
        description: expense.description,
        reference: data.paymentReference,
        amount: expense.totalAmount,
        direction: 'OUTFLOW',
        bankAccountId: data.bankAccountId,
        mpesaAccountId: data.mpesaAccountId,
        journalEntryId: entry.id,
        expenseId: expense.id,
        userId,
      });
    }
    return expense;
  });
}

export async function submitExpense(id: string, userId: string) {
  const expense = await prisma.expense.findUnique({ where: { id } });
  if (!expense) throw new Error('Expense not found');
  if (expense.status !== 'DRAFT') throw new Error('Only draft expenses can be submitted');
  return prisma.expense.update({ where: { id }, data: { status: 'SUBMITTED', submittedAt: new Date(), submittedById: userId } });
}

export async function approveExpense(id: string, userId: string) {
  return prisma.$transaction(async (tx) => {
    const expense = await tx.expense.findUnique({ where: { id }, include: { category: true } });
    if (!expense) throw new Error('Expense not found');
    if (!['DRAFT', 'SUBMITTED'].includes(expense.status)) throw new Error('Only draft or submitted expenses can be approved');
    const categoryAccount = expense.category.ledgerAccountId ? await tx.ledgerAccount.findUnique({ where: { id: expense.category.ledgerAccountId } }) : null;
    await postJournal(tx, {
      event: 'EXPENSE_RECORDED',
      entryDate: expense.expenseDate,
      description: expense.description,
      reference: expense.expenseNumber,
      source: { expenseId: id },
      sourceKey: `expense-approved:${id}`,
      userId,
      lines: [
        { accountCode: categoryAccount?.code ?? SYSTEM_ACCOUNTS.OPERATING_EXPENSES, debit: expense.totalAmount },
        { accountCode: SYSTEM_ACCOUNTS.ACCOUNTS_PAYABLE, credit: expense.totalAmount },
      ],
    });
    return tx.expense.update({ where: { id }, data: { status: 'APPROVED', approvedById: userId, approvedAt: new Date() } });
  });
}

export async function rejectExpense(id: string, reason: string, userId: string) {
  const expense = await prisma.expense.findUnique({ where: { id } });
  if (!expense) throw new Error('Expense not found');
  if (!['DRAFT', 'SUBMITTED'].includes(expense.status)) throw new Error('Only draft or submitted expenses can be rejected');
  return prisma.expense.update({ where: { id }, data: { status: 'REJECTED', rejectedAt: new Date(), rejectedById: userId, rejectionReason: reason } });
}

export async function payExpense(id: string, data: PayExpenseInput, userId: string) {
  return prisma.$transaction(async (tx) => {
    const expense = await tx.expense.findUnique({ where: { id }, include: { category: true } });
    if (!expense) throw new Error('Expense not found');
    if (expense.status !== 'APPROVED') throw new Error('Expense must be approved before payment');
    await assertOpenFinancialPeriodForPosting(tx, data.paidAt ? new Date(data.paidAt) : new Date(), 'expense:pay');
    await checkDuplicateReference(tx, {
      module: 'expense',
      reference: data.paymentReference,
      amount: expense.totalAmount,
      date: data.paidAt ? new Date(data.paidAt) : new Date(),
      overrideReason: data.overrideReason,
      excludeId: expense.id,
    });

    const entry = await postJournal(tx, {
      event: 'EXPENSE_PAID',
      entryDate: data.paidAt ? new Date(data.paidAt) : new Date(),
      description: expense.description,
      reference: data.paymentReference,
      source: { expenseId: id },
      sourceKey: `expense-paid:${id}`,
      userId,
      lines: [
        { accountCode: SYSTEM_ACCOUNTS.ACCOUNTS_PAYABLE, debit: expense.totalAmount },
        { accountCode: accountCodeForPayment(data.paymentMethod), credit: expense.totalAmount },
      ],
    });

    await createFinanceTransaction(tx, {
      type: 'EXPENSE_PAYMENT',
      transactionDate: data.paidAt ? new Date(data.paidAt) : new Date(),
      description: expense.description,
      reference: data.paymentReference,
      amount: expense.totalAmount,
      direction: 'OUTFLOW',
      bankAccountId: data.bankAccountId ?? expense.bankAccountId,
      mpesaAccountId: data.mpesaAccountId ?? expense.mpesaAccountId,
      journalEntryId: entry.id,
      expenseId: id,
      userId,
    });

    return tx.expense.update({
      where: { id },
      data: {
        status: 'PAID',
        paymentMethod: data.paymentMethod as any,
        paymentReference: data.paymentReference,
        bankAccountId: data.bankAccountId ?? expense.bankAccountId,
        mpesaAccountId: data.mpesaAccountId ?? expense.mpesaAccountId,
        paidAt: data.paidAt ? new Date(data.paidAt) : new Date(),
        paidById: userId,
      },
    });
  });
}

export async function voidExpense(id: string, reason: string, userId: string) {
  const expense = await prisma.expense.findUnique({ where: { id } });
  if (!expense) throw new Error('Expense not found');
  if (expense.status === 'PAID') throw new Error('Paid expenses must be reversed through journals before voiding');
  return prisma.expense.update({ where: { id }, data: { status: 'VOIDED', voidedAt: new Date(), voidedById: userId, voidReason: reason } });
}

export async function getRemittanceCandidates(insurerId?: string) {
  return prisma.policy.findMany({
    where: {
      deletedAt: null,
      premiumCollectionMode: { in: ['BROKER_COLLECTED', 'MIXED'] },
      brokerCollectedAmount: { gt: 0 },
      ...(insurerId && { insurerId }),
    },
    include: { client: true, insurer: true, product: true, insurerRemittanceLines: true },
    orderBy: { endDate: 'asc' },
  });
}

export async function createInsurerRemittance(data: CreateRemittanceInput, userId: string) {
  return prisma.$transaction(async (tx) => {
    const policies = await tx.policy.findMany({ where: { id: { in: data.policyIds }, insurerId: data.insurerId, deletedAt: null } });
    if (policies.length !== data.policyIds.length) throw new Error('One or more policies are invalid for this insurer');
    const gross = policies.reduce((sum, policy) => sum.plus(policy.brokerCollectedAmount), new Decimal(0));
    const commission = data.settlementMode === 'DEDUCTED_AT_SOURCE'
      ? policies.reduce((sum, policy) => sum.plus(policy.commissionReceivableAmount), new Decimal(0))
      : new Decimal(0);
    const net = gross.minus(commission);

    return tx.insurerRemittance.create({
      data: {
        remittanceNumber: await nextNumber('insurerRemittance', 'remittanceNumber', 'REM', tx),
        insurerId: data.insurerId,
        remittanceDate: new Date(data.remittanceDate),
        dueDate: data.dueDate ? new Date(data.dueDate) : null,
        grossPremiumAmount: gross,
        commissionDeductedAmount: commission,
        netRemittanceAmount: net,
        settlementMode: data.settlementMode as any,
        notes: data.notes ?? null,
        createdById: userId,
        lines: {
          create: policies.map((policy) => {
            const policyCommission = data.settlementMode === 'DEDUCTED_AT_SOURCE' ? policy.commissionReceivableAmount : new Decimal(0);
            return {
              policyId: policy.id,
              grossPremiumAmount: policy.brokerCollectedAmount,
              commissionAmount: policyCommission,
              netPayableAmount: policy.brokerCollectedAmount.minus(policyCommission),
              dueDate: data.dueDate ? new Date(data.dueDate) : null,
            };
          }),
        },
      },
      include: { lines: true, insurer: true },
    });
  });
}

export async function listInsurerRemittances(req: AuthRequest) {
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(200, Math.max(10, parseInt(req.query.limit as string) || 30));
  const skip = (page - 1) * limit;
  const insurerId = req.query.insurerId as string | undefined;
  const status = req.query.status as string | undefined;
  const settlementMode = req.query.settlementMode as string | undefined;
  const q = String(req.query.q ?? '').trim();
  const where: Prisma.InsurerRemittanceWhereInput = {
    deletedAt: null,
    ...(insurerId && { insurerId }),
    ...(status && { status: status as any }),
    ...(settlementMode && { settlementMode: settlementMode as any }),
    ...(q
      ? {
          OR: [
            { remittanceNumber: { contains: q, mode: 'insensitive' } },
            { paymentReference: { contains: q, mode: 'insensitive' } },
            { insurer: { name: { contains: q, mode: 'insensitive' } } },
          ],
        }
      : {}),
  };
  const [items, total] = await Promise.all([
    prisma.insurerRemittance.findMany({
      where,
      skip,
      take: limit,
      include: { insurer: true, lines: { include: { policy: { include: { client: true, product: true } } } } },
      orderBy: { remittanceDate: 'desc' },
    }),
    prisma.insurerRemittance.count({ where }),
  ]);
  return { items, total, page, limit };
}

export async function payInsurerRemittance(id: string, data: PayRemittanceInput, userId: string) {
  return prisma.$transaction(async (tx) => {
    const remittance = await tx.insurerRemittance.findUnique({ where: { id }, include: { lines: true } });
    if (!remittance) throw new Error('Insurer remittance not found');
    const paidAmount = decimal(data.paidAmount);
    await assertOpenFinancialPeriodForPosting(tx, data.paidAt ? new Date(data.paidAt) : new Date(), 'remittance:pay');
    if (paidAmount.gt(remittance.netRemittanceAmount.minus(remittance.paidAmount))) throw new Error('Payment exceeds remittance balance');
    await checkDuplicateReference(tx, {
      module: 'remittance',
      reference: data.paymentReference,
      amount: paidAmount,
      date: data.paidAt ? new Date(data.paidAt) : new Date(),
      overrideReason: data.overrideReason,
      excludeId: remittance.id,
    });

    const entry = await postJournal(tx, {
      event: 'INSURER_REMITTANCE_PAID',
      entryDate: data.paidAt ? new Date(data.paidAt) : new Date(),
      description: `Insurer remittance ${remittance.remittanceNumber}`,
      reference: data.paymentReference,
      source: { remittanceId: id, insurerId: remittance.insurerId },
      sourceKey: `remittance-paid:${id}:${remittance.paidAmount.plus(paidAmount).toFixed(2)}`,
      userId,
      lines: [
        { accountCode: SYSTEM_ACCOUNTS.INSURER_PAYABLE, debit: paidAmount },
        { accountCode: accountCodeForPayment(data.paymentMethod, true), credit: paidAmount },
      ],
    });

    await createFinanceTransaction(tx, {
      type: 'INSURER_REMITTANCE',
      transactionDate: data.paidAt ? new Date(data.paidAt) : new Date(),
      description: `Insurer remittance ${remittance.remittanceNumber}`,
      reference: data.paymentReference,
      amount: paidAmount,
      direction: 'OUTFLOW',
      bankAccountId: data.bankAccountId,
      mpesaAccountId: data.mpesaAccountId,
      journalEntryId: entry.id,
      remittanceId: id,
      insurerId: remittance.insurerId,
      userId,
    });

    const totalPaid = remittance.paidAmount.plus(paidAmount);
    const status = totalPaid.gte(remittance.netRemittanceAmount) ? 'PAID' : 'PARTIALLY_PAID';
    await tx.insurerRemittanceLine.updateMany({ where: { remittanceId: id }, data: { status: status === 'PAID' ? 'REMITTED' : 'PARTIALLY_REMITTED', remittedAmount: paidAmount } });
    return tx.insurerRemittance.update({
      where: { id },
      data: { paidAmount: totalPaid, status, paymentMethod: data.paymentMethod as any, paymentReference: data.paymentReference, paidAt: data.paidAt ? new Date(data.paidAt) : new Date(), paidById: userId },
    });
  });
}

export async function uploadStatement(data: StatementUploadInput, userId: string) {
  return prisma.$transaction(async (tx) => {
    if (!data.bankAccountId && !data.mpesaAccountId) throw new Error('A bank or M-Pesa account is required');
    const preset = data.preset ?? 'STRICT';
    const upload = await tx.statementUpload.create({
      data: {
        bankAccountId: data.bankAccountId ?? null,
        mpesaAccountId: data.mpesaAccountId ?? null,
        statementType: data.statementType,
        fileName: data.fileName,
        fileUrl: data.fileUrl,
        periodStart: new Date(data.periodStart),
        periodEnd: new Date(data.periodEnd),
        openingBalance: decimal(data.openingBalance),
        closingBalance: decimal(data.closingBalance),
        totalTransactions: data.rows.length,
        unmatchedCount: data.rows.length,
        uploadedById: userId,
        createdById: userId,
        notes: JSON.stringify({ preset, notes: data.notes ?? null }),
      },
    });

    let running = decimal(data.openingBalance);
    for (const row of data.rows) {
      const txDate = new Date(row.transactionDate);
      const amount = decimal(row.amount);
      running = running.plus(calculateRunningBalanceDelta(row.isDebit, amount));
      const scored = await scoreMatch(tx, {
        transactionDate: txDate,
        reference: row.reference,
        amount,
        isDebit: row.isDebit,
      }, {
        bankAccountId: data.bankAccountId,
        mpesaAccountId: data.mpesaAccountId,
        preset,
        onlyUnreconciled: true,
      });
      const match = scored?.candidate ?? null;
      const item = await tx.reconciliationItem.create({
        data: {
          statementUploadId: upload.id,
          transactionDate: txDate,
          valueDate: row.valueDate ? new Date(row.valueDate) : null,
          description: row.description,
          reference: row.reference ?? null,
          amount,
          isDebit: row.isDebit,
          runningBalance: row.runningBalance == null ? running : decimal(row.runningBalance),
          matchedFinanceTransactionId: null,
          matchStatus: 'UNMATCHED',
          matchConfidence: null,
          matchedAt: null,
          matchedById: null,
          notes: scored ? `suggestedMatchLevel:${scored.level}` : null,
        },
      });

      if (match && scored && scored.score >= 0.9) {
        const txMatchedAmount = await getTransactionMatchedAmount(tx, match.id);
        const txRemaining = decimal(match.amount).minus(txMatchedAmount);
        const allocatable = Decimal.min(amount, txRemaining);
        if (allocatable.gt(0)) {
          await (tx as any).reconciliationMatch.create({
            data: {
              statementUploadId: upload.id,
              reconciliationItemId: item.id,
              financeTransactionId: match.id,
              matchedAmount: allocatable,
              matchConfidence: new Decimal(scored.score.toFixed(2)),
              matchLevel: scored.level,
              isAuto: true,
              notes: 'Auto-matched during statement upload',
              createdById: userId,
            },
          });
          await refreshReconciliationItemStatus(tx, item.id, userId);
          await refreshFinanceTransactionStatus(tx, match.id, userId);
        }
      }
    }
    const computedClosingBalance = running;
    await refreshStatementMatchCounts(tx, upload.id);
    const refreshed = await tx.statementUpload.findUniqueOrThrow({
      where: { id: upload.id },
      select: { matchedCount: true, unmatchedCount: true, status: true },
    });
    return tx.statementUpload.update({
      where: { id: upload.id },
      data: {
        matchedCount: refreshed.matchedCount,
        unmatchedCount: refreshed.unmatchedCount,
        status: refreshed.status,
        notes: JSON.stringify({
          preset,
          notes: data.notes ?? null,
          computedClosingBalance: computedClosingBalance.toFixed(2),
        }),
      },
      include: { items: true, bankAccount: true, mpesaAccount: true },
    });
  });
}

export async function listStatementUploads(req?: AuthRequest) {
  const q = String(req?.query?.q ?? '').trim();
  const accountId = req?.query?.accountId as string | undefined;
  const status = req?.query?.status as string | undefined;
  const statementType = req?.query?.statementType as string | undefined;
  const includeItems = req?.query?.includeItems !== 'false';
  const dateFrom = req?.query?.dateFrom ? new Date(String(req?.query?.dateFrom)) : null;
  const dateTo = req?.query?.dateTo ? new Date(String(req?.query?.dateTo)) : null;
  const periodStart =
    dateFrom || dateTo
      ? {
          ...(dateFrom ? { gte: dateFrom } : {}),
          ...(dateTo ? { lte: dateTo } : {}),
        }
      : undefined;
  const uploads: any[] = await prisma.statementUpload.findMany({
    where: {
      ...(accountId ? { OR: [{ bankAccountId: accountId }, { mpesaAccountId: accountId }] } : {}),
      ...(status ? { status: status as any } : {}),
      ...(statementType ? { statementType: statementType as any } : {}),
      ...(periodStart ? { periodStart } : {}),
      ...(q
        ? {
            OR: [
              { fileName: { contains: q, mode: 'insensitive' } },
              { bankAccount: { accountName: { contains: q, mode: 'insensitive' } } },
              { mpesaAccount: { accountName: { contains: q, mode: 'insensitive' } } },
            ],
          }
        : {}),
    },
    include: {
      bankAccount: true,
      mpesaAccount: true,
      ...(includeItems
        ? {
            items: {
              take: 50,
              orderBy: { transactionDate: 'desc' },
              include: {
                matchedFinanceTransaction: true,
                matches: { include: { financeTransaction: true }, orderBy: { createdAt: 'asc' } },
              },
            },
          }
        : {}),
    },
    orderBy: { createdAt: 'desc' },
  });
  const pendingReopens = await prisma.approvalRequest.findMany({
    where: {
      entityType: 'StatementUpload',
      requestType: 'RECON_REOPEN',
      status: 'PENDING',
      entityId: { in: uploads.map((upload) => upload.id) },
    },
    select: { entityId: true },
  });
  const pendingReopenSet = new Set(pendingReopens.map((request) => request.entityId));
  return uploads.map((upload: any) => ({
    ...upload,
    hasPendingReopenRequest: pendingReopenSet.has(upload.id),
    items: includeItems
      ? upload.items.map((item: any) => ({
          ...item,
          matchedAmount: item.matches.reduce((sum: number, match: any) => sum + Number(match.matchedAmount), 0),
          remainingAmount: Number(item.amount) - item.matches.reduce((sum: number, match: any) => sum + Number(match.matchedAmount), 0),
          matchLevel: determineMatchLevel(asNumber(item.matchConfidence)),
        }))
      : [],
  }));
}

export async function matchReconciliationItem(
  itemId: string,
  financeTransactionId: string,
  userId: string,
  notes?: string | null,
  matchAmount?: number | null,
) {
  return prisma.$transaction(async (tx) => {
    const item = await tx.reconciliationItem.findUnique({
      where: { id: itemId },
      include: { statementUpload: true },
    });
    const financeTransaction = await tx.financeTransaction.findUnique({ where: { id: financeTransactionId } });
    if (!item) throw new Error('Reconciliation item not found');
    if (!financeTransaction) throw new Error('Finance transaction not found');
    ensureStatementEditable(item.statementUpload.status);
    validateTransactionMatchCompatibility(item as any, financeTransaction as any);

    const itemMatchedAmount = await getItemMatchedAmount(tx, itemId);
    const txMatchedAmount = await getTransactionMatchedAmount(tx, financeTransactionId);
    const itemRemaining = decimal(item.amount).minus(itemMatchedAmount);
    const txRemaining = decimal(financeTransaction.amount).minus(txMatchedAmount);
    if (itemRemaining.lte(0)) {
      throw new FinanceValidationError(
        'Statement line is already fully matched',
        'RECON_ITEM_ALREADY_FULLY_MATCHED',
        { itemId, matchedAmount: Number(itemMatchedAmount), amount: Number(item.amount) },
      );
    }
    if (txRemaining.lte(0)) {
      throw new FinanceValidationError(
        'Finance transaction is already fully matched',
        'RECON_TRANSACTION_ALREADY_FULLY_MATCHED',
        { financeTransactionId, matchedAmount: Number(txMatchedAmount), amount: Number(financeTransaction.amount) },
      );
    }
    const requestedAmount = matchAmount == null ? Decimal.min(itemRemaining, txRemaining) : decimal(matchAmount);
    if (requestedAmount.lte(0)) {
      throw new FinanceValidationError(
        'Match amount must be greater than zero',
        'RECON_MATCH_AMOUNT_INVALID',
        { field: 'matchAmount', requestedAmount: Number(requestedAmount) },
      );
    }
    if (requestedAmount.gt(itemRemaining)) {
      throw new FinanceValidationError(
        'Match amount exceeds remaining statement line amount',
        'RECON_MATCH_AMOUNT_EXCEEDS_ITEM',
        { field: 'matchAmount', itemRemaining: Number(itemRemaining), requestedAmount: Number(requestedAmount) },
      );
    }
    if (requestedAmount.gt(txRemaining)) {
      throw new FinanceValidationError(
        'Match amount exceeds remaining transaction amount',
        'RECON_MATCH_AMOUNT_EXCEEDS_TRANSACTION',
        { field: 'matchAmount', transactionRemaining: Number(txRemaining), requestedAmount: Number(requestedAmount) },
      );
    }

    const existingLink = await (tx as any).reconciliationMatch.findUnique({
      where: { reconciliationItemId_financeTransactionId: { reconciliationItemId: itemId, financeTransactionId } },
    });
    if (existingLink) {
      await (tx as any).reconciliationMatch.update({
        where: { id: existingLink.id },
        data: {
          matchedAmount: existingLink.matchedAmount.plus(requestedAmount),
          matchConfidence: new Decimal(1),
          matchLevel: 'HIGH',
          notes: notes ?? existingLink.notes,
          createdById: userId,
        },
      });
    } else {
      await (tx as any).reconciliationMatch.create({
        data: {
          statementUploadId: item.statementUploadId,
          reconciliationItemId: itemId,
          financeTransactionId,
          matchedAmount: requestedAmount,
          matchConfidence: new Decimal(1),
          matchLevel: 'HIGH',
          isAuto: false,
          notes: notes ?? null,
          createdById: userId,
        },
      });
    }

    await refreshReconciliationItemStatus(tx, itemId, userId);
    await refreshFinanceTransactionStatus(tx, financeTransactionId, userId);
    await refreshStatementMatchCounts(tx, item.statementUploadId);

    const updated: any = await tx.reconciliationItem.findUniqueOrThrow({
      where: { id: itemId },
      include: {
        matches: {
          include: { financeTransaction: true },
          orderBy: { createdAt: 'asc' },
        },
      },
    } as any);
    return {
      ...updated,
      matchedAmount: updated.matches.reduce((sum: number, match: any) => sum + Number(match.matchedAmount), 0),
      remainingAmount: Number(updated.amount) - updated.matches.reduce((sum: number, match: any) => sum + Number(match.matchedAmount), 0),
    };
  });
}

export async function unlinkReconciliationMatch(
  matchId: string,
  userId: string,
  reason: UnlinkReconciliationMatchInput['reason'],
) {
  return prisma.$transaction(async (tx) => {
    const match: any = await (tx as any).reconciliationMatch.findUnique({
      where: { id: matchId },
      include: {
        reconciliationItem: { include: { statementUpload: true } },
        financeTransaction: true,
      },
    });
    if (!match) throw new Error('Reconciliation match not found');
    ensureStatementEditable(match.reconciliationItem.statementUpload.status);
    if (match.reconciliationItem.matchStatus === 'RECONCILED' || match.financeTransaction.reconciliationStatus === 'RECONCILED') {
      throw new FinanceValidationError(
        'Cannot unlink reconciled matches. Re-open workflow is required.',
        'RECON_MATCH_LOCKED',
        {
          statementStatus: match.reconciliationItem.statementUpload.status,
          itemStatus: match.reconciliationItem.matchStatus,
          transactionStatus: match.financeTransaction.reconciliationStatus,
        },
      );
    }
    await (tx as any).reconciliationMatch.delete({ where: { id: matchId } });
    await refreshReconciliationItemStatus(tx, match.reconciliationItemId, userId);
    await refreshFinanceTransactionStatus(tx, match.financeTransactionId, userId);
    await refreshStatementMatchCounts(tx, match.statementUploadId);
    const refreshedItem: any = await tx.reconciliationItem.findUnique({
      where: { id: match.reconciliationItemId },
      include: { matches: { include: { financeTransaction: true }, orderBy: { createdAt: 'asc' } } },
    } as any);
    const refreshedTransaction = await tx.financeTransaction.findUnique({ where: { id: match.financeTransactionId } });
    return {
      unlinkedMatchId: matchId,
      reason,
      statementUploadId: match.statementUploadId,
      reconciliationItem: refreshedItem,
      financeTransaction: refreshedTransaction,
    };
  });
}

export async function reallocateReconciliationMatch(
  matchId: string,
  data: ReallocateReconciliationMatchInput,
  userId: string,
) {
  return prisma.$transaction(async (tx) => {
    const currentMatch: any = await (tx as any).reconciliationMatch.findUnique({
      where: { id: matchId },
      include: {
        reconciliationItem: { include: { statementUpload: true } },
        financeTransaction: true,
      },
    });
    if (!currentMatch) throw new Error('Reconciliation match not found');
    if (currentMatch.financeTransactionId === data.targetFinanceTransactionId) {
      throw new FinanceValidationError(
        'Target transaction must be different from current match transaction',
        'RECON_REALLOCATE_TARGET_INVALID',
        { field: 'targetFinanceTransactionId' },
      );
    }
    ensureStatementEditable(currentMatch.reconciliationItem.statementUpload.status);
    if (currentMatch.reconciliationItem.matchStatus === 'RECONCILED' || currentMatch.financeTransaction.reconciliationStatus === 'RECONCILED') {
      throw new FinanceValidationError(
        'Cannot reallocate reconciled matches. Re-open workflow is required.',
        'RECON_MATCH_LOCKED',
        {
          statementStatus: currentMatch.reconciliationItem.statementUpload.status,
          itemStatus: currentMatch.reconciliationItem.matchStatus,
          transactionStatus: currentMatch.financeTransaction.reconciliationStatus,
        },
      );
    }
    const targetTx = await tx.financeTransaction.findUnique({ where: { id: data.targetFinanceTransactionId } });
    if (!targetTx) throw new Error('Target finance transaction not found');
    validateTransactionMatchCompatibility(currentMatch.reconciliationItem as any, targetTx as any);
    if (targetTx.reconciliationStatus === 'RECONCILED') {
      throw new FinanceValidationError(
        'Target finance transaction is already reconciled',
        'RECON_TARGET_TRANSACTION_LOCKED',
        { targetFinanceTransactionId: targetTx.id, reconciliationStatus: targetTx.reconciliationStatus },
      );
    }

    const itemMatchedAmount = await getItemMatchedAmount(tx, currentMatch.reconciliationItemId);
    const itemRemaining = decimal(currentMatch.reconciliationItem.amount).minus(itemMatchedAmount);
    const originalMatchedAmount = decimal(currentMatch.matchedAmount);
    const txMatchedAmount = await getTransactionMatchedAmount(tx, targetTx.id);
    const txRemaining = decimal(targetTx.amount).minus(txMatchedAmount);
    const requestedAmount = data.reallocatedAmount == null ? originalMatchedAmount : decimal(data.reallocatedAmount);
    if (requestedAmount.lte(0)) {
      throw new FinanceValidationError(
        'Reallocated amount must be greater than zero',
        'RECON_REALLOCATE_AMOUNT_INVALID',
        { field: 'reallocatedAmount', requestedAmount: Number(requestedAmount) },
      );
    }
    if (requestedAmount.gt(originalMatchedAmount)) {
      throw new FinanceValidationError(
        'Reallocated amount exceeds source match amount',
        'RECON_REALLOCATE_AMOUNT_EXCEEDS_SOURCE',
        { sourceMatchedAmount: Number(originalMatchedAmount), requestedAmount: Number(requestedAmount) },
      );
    }
    if (requestedAmount.gt(txRemaining)) {
      throw new FinanceValidationError(
        'Reallocated amount exceeds target transaction remaining amount',
        'RECON_REALLOCATE_AMOUNT_EXCEEDS_TARGET',
        { targetRemaining: Number(txRemaining), requestedAmount: Number(requestedAmount) },
      );
    }

    const nextSourceAmount = originalMatchedAmount.minus(requestedAmount);
    if (nextSourceAmount.lte(0)) {
      await (tx as any).reconciliationMatch.delete({ where: { id: currentMatch.id } });
    } else {
      await (tx as any).reconciliationMatch.update({
        where: { id: currentMatch.id },
        data: {
          matchedAmount: nextSourceAmount,
          notes: `${currentMatch.notes ?? ''}${currentMatch.notes ? ' | ' : ''}Reallocated ${requestedAmount.toFixed(2)} on ${new Date().toISOString()}. Reason: ${data.reason}`,
        },
      });
    }

    const existingTargetLink = await (tx as any).reconciliationMatch.findUnique({
      where: {
        reconciliationItemId_financeTransactionId: {
          reconciliationItemId: currentMatch.reconciliationItemId,
          financeTransactionId: targetTx.id,
        },
      },
    });

    if (existingTargetLink) {
      await (tx as any).reconciliationMatch.update({
        where: { id: existingTargetLink.id },
        data: {
          matchedAmount: existingTargetLink.matchedAmount.plus(requestedAmount),
          matchConfidence: new Decimal(1),
          matchLevel: 'HIGH',
          isAuto: false,
          notes: data.notes ?? `Reallocated from ${currentMatch.financeTransaction.transactionNumber}`,
          createdById: userId,
        },
      });
    } else {
      await (tx as any).reconciliationMatch.create({
        data: {
          statementUploadId: currentMatch.statementUploadId,
          reconciliationItemId: currentMatch.reconciliationItemId,
          financeTransactionId: targetTx.id,
          matchedAmount: requestedAmount,
          matchConfidence: new Decimal(1),
          matchLevel: 'HIGH',
          isAuto: false,
          notes: data.notes ?? `Reallocated from ${currentMatch.financeTransaction.transactionNumber}`,
          createdById: userId,
        },
      });
    }

    if (itemRemaining.gt(0) && requestedAmount.gt(itemRemaining.plus(originalMatchedAmount))) {
      throw new FinanceValidationError(
        'Reallocation created invalid statement allocation state',
        'RECON_REALLOCATE_INVALID_ITEM_STATE',
        { requestedAmount: Number(requestedAmount), itemRemaining: Number(itemRemaining) },
      );
    }

    await refreshReconciliationItemStatus(tx, currentMatch.reconciliationItemId, userId);
    await refreshFinanceTransactionStatus(tx, currentMatch.financeTransactionId, userId);
    await refreshFinanceTransactionStatus(tx, targetTx.id, userId);
    await refreshStatementMatchCounts(tx, currentMatch.statementUploadId);

    const refreshedItem: any = await tx.reconciliationItem.findUnique({
      where: { id: currentMatch.reconciliationItemId },
      include: { matches: { include: { financeTransaction: true }, orderBy: { createdAt: 'asc' } } },
    } as any);

    return {
      statementUploadId: currentMatch.statementUploadId,
      reconciliationItem: refreshedItem,
      sourceTransactionId: currentMatch.financeTransactionId,
      targetTransactionId: targetTx.id,
      reallocatedAmount: Number(requestedAmount),
      reason: data.reason,
    };
  });
}

export async function completeReconciliation(statementUploadId: string, userId: string) {
  return prisma.$transaction(async (tx) => {
    const upload: any = await tx.statementUpload.findUnique({
      where: { id: statementUploadId },
      include: { items: { include: { matches: true } } },
    } as any);
    if (!upload) throw new Error('Statement upload not found');
    ensureStatementEditable(upload.status);
    const runningFromItems = upload.items.length > 0
      ? upload.items
        .sort((a: any, b: any) => a.transactionDate.getTime() - b.transactionDate.getTime())
        .reduce((sum: Decimal, item: any) => sum.plus(calculateRunningBalanceDelta(item.isDebit, item.amount)), decimal(upload.openingBalance))
      : decimal(upload.openingBalance);
    const delta = runningFromItems.minus(upload.closingBalance).abs();
    if (delta.gt(0.01)) {
      throw new FinanceValidationError(
        `Closing balance mismatch. Expected ${runningFromItems.toFixed(2)} but statement has ${decimal(upload.closingBalance).toFixed(2)} (delta ${delta.toFixed(2)})`,
        'RECON_CLOSING_BALANCE_MISMATCH',
        {
          statementUploadId,
          expectedClosingBalance: Number(runningFromItems.toFixed(2)),
          providedClosingBalance: Number(decimal(upload.closingBalance).toFixed(2)),
          delta: Number(delta.toFixed(2)),
          tolerance: 0.01,
        },
      );
    }
    const unresolved = upload.items.filter((item: any) => {
      const matchedAmount = item.matches.reduce((sum: Decimal, match: any) => sum.plus(match.matchedAmount), new Decimal(0));
      return matchedAmount.lt(item.amount) && item.matchStatus !== 'EXCLUDED';
    });
    if (unresolved.length > 0) {
      throw new FinanceValidationError(
        'Cannot complete reconciliation with unresolved statement lines',
        'RECON_UNRESOLVED_ITEMS',
        {
          statementUploadId,
          unresolvedCount: unresolved.length,
          unresolvedItemIds: unresolved.slice(0, 20).map((item: any) => item.id),
        },
      );
    }

    const matches = await (tx as any).reconciliationMatch.findMany({
      where: { statementUploadId },
      select: { reconciliationItemId: true, financeTransactionId: true },
    });
    const uniqueItemIds = Array.from(new Set(matches.map((match: any) => match.reconciliationItemId))) as string[];
    const uniqueTransactionIds = Array.from(new Set(matches.map((match: any) => match.financeTransactionId))) as string[];
    for (const itemId of uniqueItemIds) {
      await refreshReconciliationItemStatus(tx, itemId, userId);
    }
    for (const financeTransactionId of uniqueTransactionIds) {
      await refreshFinanceTransactionStatus(tx, financeTransactionId, userId);
    }

    await tx.reconciliationItem.updateMany({
      where: { statementUploadId, matchStatus: { in: ['MATCHED', 'MANUALLY_MATCHED', 'PARTIALLY_MATCHED'] as any } },
      data: { matchStatus: 'RECONCILED' as any, matchedAt: new Date(), matchedById: userId },
    });
    await tx.financeTransaction.updateMany({
      where: { id: { in: uniqueTransactionIds }, reconciliationStatus: { in: ['MATCHED', 'PARTIALLY_MATCHED'] as any } },
      data: { reconciliationStatus: 'RECONCILED' as any, reconciledAt: new Date(), reconciledById: userId },
    });
    await refreshStatementMatchCounts(tx, statementUploadId);
    return tx.statementUpload.update({
      where: { id: statementUploadId },
      data: { status: 'COMPLETED', reconciledAt: new Date(), reconciledById: userId, completedAt: new Date(), completedById: userId },
      include: { items: true, bankAccount: true, mpesaAccount: true },
    });
  });
}

export async function acceptHighConfidenceMatches(statementUploadId: string, userId: string, preset: ReconciliationPreset = 'STRICT', minScore = 0.9) {
  return prisma.$transaction(async (tx) => {
    const upload: any = await tx.statementUpload.findUnique({
      where: { id: statementUploadId },
      include: { items: { include: { matches: true } } },
    } as any);
    if (!upload) throw new Error('Statement upload not found');
    let accepted = 0;
    for (const item of upload.items) {
      const itemAlreadyMatched = item.matches.reduce((sum: Decimal, match: any) => sum.plus(match.matchedAmount), new Decimal(0));
      const itemRemaining = decimal(item.amount).minus(itemAlreadyMatched);
      if (itemRemaining.lte(0)) continue;
      const scored = await scoreMatch(tx, {
        transactionDate: item.transactionDate,
        reference: item.reference,
        amount: decimal(item.amount),
        isDebit: item.isDebit,
      }, {
        bankAccountId: upload.bankAccountId,
        mpesaAccountId: upload.mpesaAccountId,
        preset,
        onlyUnreconciled: true,
      });
      if (!scored || scored.score < minScore) continue;
      const txMatchedAmount = await getTransactionMatchedAmount(tx, scored.candidate.id);
      const txRemaining = decimal(scored.candidate.amount).minus(txMatchedAmount);
      const allocatable = Decimal.min(itemRemaining, txRemaining);
      if (allocatable.lte(0)) continue;

      const link = await (tx as any).reconciliationMatch.findUnique({
        where: {
          reconciliationItemId_financeTransactionId: {
            reconciliationItemId: item.id,
            financeTransactionId: scored.candidate.id,
          },
        },
      });
      if (link) {
        await (tx as any).reconciliationMatch.update({
          where: { id: link.id },
          data: {
            matchedAmount: link.matchedAmount.plus(allocatable),
            matchConfidence: new Decimal(scored.score.toFixed(2)),
            matchLevel: scored.level,
            isAuto: true,
            notes: `Auto-match accepted (${preset})`,
            createdById: userId,
          },
        });
      } else {
        await (tx as any).reconciliationMatch.create({
          data: {
            statementUploadId,
            reconciliationItemId: item.id,
            financeTransactionId: scored.candidate.id,
            matchedAmount: allocatable,
            matchConfidence: new Decimal(scored.score.toFixed(2)),
            matchLevel: scored.level,
            isAuto: true,
            notes: `Auto-match accepted (${preset})`,
            createdById: userId,
          },
        });
      }
      await refreshReconciliationItemStatus(tx, item.id, userId);
      await refreshFinanceTransactionStatus(tx, scored.candidate.id, userId);
      accepted += 1;
    }
    await refreshStatementMatchCounts(tx, statementUploadId);
    const updated: any = await tx.statementUpload.findUniqueOrThrow({
      where: { id: statementUploadId },
      include: {
        items: {
          include: {
            matchedFinanceTransaction: true,
            matches: { include: { financeTransaction: true }, orderBy: { createdAt: 'asc' } },
          },
        },
        bankAccount: true,
        mpesaAccount: true,
      },
    } as any);
    return {
      accepted,
      statement: {
        ...updated,
        items: updated.items.map((item: any) => {
          const matchedAmount = item.matches.reduce((sum: number, match: any) => sum + Number(match.matchedAmount), 0);
          return {
            ...item,
            matchedAmount,
            remainingAmount: Number(item.amount) - matchedAmount,
            matchLevel: determineMatchLevel(asNumber(item.matchConfidence)),
          };
        }),
      },
    };
  });
}

export async function createMissingTransactionFromStatementItem(itemId: string, data: CreateMissingTransactionInput, userId: string) {
  return prisma.$transaction(async (tx) => {
    const item: any = await tx.reconciliationItem.findUnique({
      where: { id: itemId },
      include: { statementUpload: true, matches: true },
    } as any);
    if (!item) throw new Error('Reconciliation item not found');
    ensureStatementEditable(item.statementUpload.status);

    const bankAccount = await tx.bankAccount.findUnique({ where: { id: data.accountId } });
    const mpesaAccount = bankAccount ? null : await tx.mpesaAccount.findUnique({ where: { id: data.accountId } });
    if (!bankAccount && !mpesaAccount) throw new Error('Selected account not found');

    if (item.statementUpload.bankAccountId && bankAccount && item.statementUpload.bankAccountId !== bankAccount.id) {
      throw new FinanceValidationError(
        'Selected account does not match the statement account',
        'RECON_ACCOUNT_MISMATCH',
        { field: 'accountId', expectedAccountId: item.statementUpload.bankAccountId, providedAccountId: bankAccount.id },
      );
    }
    if (item.statementUpload.bankAccountId && mpesaAccount) {
      throw new FinanceValidationError(
        'Selected account does not match the statement account',
        'RECON_ACCOUNT_MISMATCH',
        { field: 'accountId', expectedAccountId: item.statementUpload.bankAccountId, providedAccountId: mpesaAccount.id },
      );
    }

    if (item.statementUpload.mpesaAccountId && mpesaAccount && item.statementUpload.mpesaAccountId !== mpesaAccount.id) {
      throw new FinanceValidationError(
        'Selected account does not match the statement account',
        'RECON_ACCOUNT_MISMATCH',
        { field: 'accountId', expectedAccountId: item.statementUpload.mpesaAccountId, providedAccountId: mpesaAccount.id },
      );
    }
    if (item.statementUpload.mpesaAccountId && bankAccount) {
      throw new FinanceValidationError(
        'Selected account does not match the statement account',
        'RECON_ACCOUNT_MISMATCH',
        { field: 'accountId', expectedAccountId: item.statementUpload.mpesaAccountId, providedAccountId: bankAccount.id },
      );
    }

    const expectedDirection = item.isDebit ? 'OUTFLOW' : 'INFLOW';
    if (data.direction !== expectedDirection) {
      throw new FinanceValidationError(
        `Direction mismatch. Statement line is ${item.isDebit ? 'debit/outflow' : 'credit/inflow'}.`,
        'RECON_DIRECTION_MISMATCH',
        {
          field: 'direction',
          expected: expectedDirection,
          provided: data.direction,
        },
      );
    }

    const sourceMode = (data as any).sourceMode ?? 'CREATE_SOURCE_RECORD';
    const alreadyMatched = item.matches.reduce((sum: Decimal, match: any) => sum.plus(match.matchedAmount), new Decimal(0));
    const remainingAmount = decimal(item.amount).minus(alreadyMatched);
    if (remainingAmount.lte(0)) {
      throw new FinanceValidationError(
        'Statement line is already fully matched',
        'RECON_ITEM_ALREADY_FULLY_MATCHED',
        { itemId, amount: Number(item.amount), matchedAmount: Number(alreadyMatched) },
      );
    }

    const createdDraft = await tx.financeTransaction.create({
      data: {
        transactionNumber: await nextNumber('financeTransaction', 'transactionNumber', 'FTX', tx),
        type: data.transactionType as any,
        status: 'DRAFT',
        transactionDate: item.transactionDate,
        description: data.description,
        reference: data.reference ?? item.reference,
        amount: remainingAmount,
        currency: 'KES',
        direction: data.direction,
        bankAccountId: bankAccount?.id ?? null,
        mpesaAccountId: mpesaAccount?.id ?? null,
        expenseId: data.expenseId ?? null,
        remittanceId: data.remittanceId ?? null,
        commissionEntryId: data.commissionEntryId ?? null,
        insurerId: data.insurerId ?? null,
        clientId: data.clientId ?? null,
        policyId: data.policyId ?? null,
        notes: data.invoiceId ? `${data.notes ?? ''}${data.notes ? ' | ' : ''}invoiceId:${data.invoiceId}` : data.notes ?? null,
        createdById: userId,
      },
    });

    let approvalRequest = null;
    if (data.requireApproval) {
      approvalRequest = await tx.approvalRequest.create({
        data: {
          entityType: 'FinanceTransaction',
          entityId: createdDraft.id,
          requestType: 'RECON_MISSING_TX',
          requestedById: userId,
          metadata: {
            reconciliationItemId: item.id,
            statementUploadId: item.statementUploadId,
            remainingAmount: remainingAmount.toFixed(2),
            reconciliationPayload: {
              ...data,
              sourceMode,
              accountId: bankAccount?.id ?? mpesaAccount?.id ?? data.accountId,
            },
          } as any,
        },
      });
    } else {
      await assertOpenFinancialPeriodForPosting(tx, item.transactionDate, 'reconciliation:create-missing-transaction');
      const posted = await postAndCreateMissingFinanceArtifacts(tx, {
        item: { ...item, amount: remainingAmount },
        data: { ...data, sourceMode } as any,
        userId,
        bankAccount,
        mpesaAccount,
      });
      await tx.financeTransaction.update({
        where: { id: createdDraft.id },
        data: {
          status: 'VOIDED',
          notes: `Superseded by posted reconciliation transaction ${posted.transactionNumber}`,
        },
      });
      await (tx as any).reconciliationMatch.create({
        data: {
          statementUploadId: item.statementUploadId,
          reconciliationItemId: item.id,
          financeTransactionId: posted.id,
          matchedAmount: remainingAmount,
          matchConfidence: new Decimal(1),
          matchLevel: 'HIGH',
          isAuto: false,
          notes: `Created from statement line (${sourceMode})`,
          createdById: userId,
        },
      });
      await refreshReconciliationItemStatus(tx, item.id, userId);
      await refreshFinanceTransactionStatus(tx, posted.id, userId);
      await refreshStatementMatchCounts(tx, item.statementUploadId);
      const refreshedItem: any = await tx.reconciliationItem.findUnique({
        where: { id: item.id },
        include: { matches: true },
      } as any);
      return {
        transaction: posted,
        reconciliationItem: refreshedItem,
        approvalRequest: null,
        requireApproval: false,
      };
    }

    await refreshStatementMatchCounts(tx, item.statementUploadId);
    return {
      transaction: createdDraft,
      approvalRequest,
      requireApproval: data.requireApproval,
    };
  });
}

export async function approveMissingTransaction(approvalId: string, userId: string, comments?: string | null) {
  return prisma.$transaction(async (tx) => {
    const request = await tx.approvalRequest.findUnique({ where: { id: approvalId } });
    if (!request) throw new Error('Approval request not found');
    if (request.entityType !== 'FinanceTransaction') throw new Error('Invalid approval request type');
    if (request.status !== 'PENDING') throw new Error('Approval request is not pending');

    const itemId = (request.metadata as any)?.reconciliationItemId as string | undefined;
    const payload = (request.metadata as any)?.reconciliationPayload as CreateMissingTransactionInput | undefined;
    const transaction = await tx.financeTransaction.findUnique({ where: { id: request.entityId } });
    if (!transaction) throw new Error('Finance transaction not found');
    if (!itemId) throw new Error('Reconciliation item metadata is missing on approval request');
    if (!payload) throw new Error('Reconciliation payload metadata is missing on approval request');
    const item: any = await tx.reconciliationItem.findUnique({
      where: { id: itemId },
      include: { statementUpload: true, matches: true },
    } as any);
    if (!item) throw new Error('Reconciliation item not found');
    const currentMatched = item.matches.reduce((sum: Decimal, match: any) => sum.plus(match.matchedAmount), new Decimal(0));
    const remainingAmount = decimal(item.amount).minus(currentMatched);
    if (remainingAmount.lte(0)) {
      throw new FinanceValidationError(
        'Statement line was fully matched before approval',
        'RECON_ITEM_ALREADY_FULLY_MATCHED',
        { itemId, amount: Number(item.amount), matchedAmount: Number(currentMatched) },
      );
    }
    await assertOpenFinancialPeriodForPosting(tx, item.transactionDate, 'reconciliation:approve-missing-transaction');
    const bankAccount = transaction.bankAccountId ? await tx.bankAccount.findUnique({ where: { id: transaction.bankAccountId } }) : null;
    const mpesaAccount = transaction.mpesaAccountId ? await tx.mpesaAccount.findUnique({ where: { id: transaction.mpesaAccountId } }) : null;
    const posted = await postAndCreateMissingFinanceArtifacts(tx, {
      item: { ...item, amount: remainingAmount },
      data: payload,
      userId,
      bankAccount,
      mpesaAccount,
    });
    await tx.financeTransaction.update({
      where: { id: transaction.id },
      data: {
        status: 'VOIDED',
        notes: `Approved and posted as ${posted.transactionNumber}`,
      },
    });
    await (tx as any).reconciliationMatch.create({
      data: {
        statementUploadId: item.statementUploadId,
        reconciliationItemId: item.id,
        financeTransactionId: posted.id,
        matchedAmount: remainingAmount,
        matchConfidence: new Decimal(1),
        matchLevel: 'HIGH',
        isAuto: false,
        notes: 'Matched via approved missing transaction',
        createdById: userId,
      },
    });
    await refreshReconciliationItemStatus(tx, item.id, userId);
    await refreshFinanceTransactionStatus(tx, posted.id, userId);
    await refreshStatementMatchCounts(tx, item.statementUploadId);
    const updatedRequest = await tx.approvalRequest.update({
      where: { id: approvalId },
      data: {
        status: 'APPROVED',
        approvedById: userId,
        approvedAt: new Date(),
        comments: comments ?? request.comments,
      },
    });
    return { draftTransactionId: transaction.id, postedTransactionId: posted.id, request: updatedRequest };
  });
}

export async function rejectMissingTransaction(approvalId: string, userId: string, comments?: string | null) {
  return prisma.$transaction(async (tx) => {
    const request = await tx.approvalRequest.findUnique({ where: { id: approvalId } });
    if (!request) throw new Error('Approval request not found');
    if (request.entityType !== 'FinanceTransaction') throw new Error('Invalid approval request type');
    if (request.status !== 'PENDING') throw new Error('Approval request is not pending');
    await tx.financeTransaction.update({ where: { id: request.entityId }, data: { status: 'VOIDED' } });
    const itemId = (request.metadata as any)?.reconciliationItemId as string | undefined;
    if (itemId) {
      const item = await tx.reconciliationItem.findUnique({ where: { id: itemId } });
      if (item) {
        await refreshStatementMatchCounts(tx, item.statementUploadId);
      }
    }
    const updatedRequest = await tx.approvalRequest.update({
      where: { id: approvalId },
      data: {
        status: 'REJECTED',
        rejectedById: userId,
        rejectedAt: new Date(),
        comments: comments ?? request.comments,
      },
    });
    return updatedRequest;
  });
}

export async function getPendingMissingTransactionApprovals() {
  return prisma.approvalRequest.findMany({
    where: { entityType: 'FinanceTransaction', status: 'PENDING', requestType: 'RECON_MISSING_TX' },
    orderBy: { requestedAt: 'asc' },
  });
}

export async function requestReopenReconciliation(
  statementUploadId: string,
  userId: string,
  payload: RequestReopenReconciliationInput,
) {
  return prisma.$transaction(async (tx) => {
    const statement = await tx.statementUpload.findUnique({ where: { id: statementUploadId } });
    if (!statement) throw new Error('Statement upload not found');
    if (!['COMPLETED', 'REVIEWED'].includes(statement.status)) {
      throw new FinanceValidationError(
        'Only completed/reviewed reconciliations can be reopened',
        'RECON_REOPEN_STATUS_INVALID',
        { statementUploadId, currentStatus: statement.status },
      );
    }
    await assertReopenAllowedByPeriod(tx, statement, 'reconciliation:reopen-request');
    const pending = await tx.approvalRequest.findFirst({
      where: {
        entityType: 'StatementUpload',
        entityId: statementUploadId,
        requestType: 'RECON_REOPEN',
        status: 'PENDING',
      },
    });
    if (pending) {
      throw new FinanceValidationError(
        'A reopen request is already pending for this statement',
        'RECON_REOPEN_ALREADY_PENDING',
        { statementUploadId, approvalRequestId: pending.id },
      );
    }

    const request = await tx.approvalRequest.create({
      data: {
        entityType: 'StatementUpload',
        entityId: statementUploadId,
        requestType: 'RECON_REOPEN',
        requestedById: userId,
        comments: payload.reason,
        metadata: {
          reason: payload.reason,
          proposedChanges: payload.proposedChanges ?? null,
          statementStatusAtRequest: statement.status,
          requestedAt: new Date().toISOString(),
        },
      },
    });
    return {
      request,
      statement: {
        id: statement.id,
        fileName: statement.fileName,
        status: statement.status,
        periodStart: statement.periodStart,
        periodEnd: statement.periodEnd,
      },
    };
  });
}

export async function getPendingReopenReconciliationApprovals() {
  const requests = await prisma.approvalRequest.findMany({
    where: { entityType: 'StatementUpload', status: 'PENDING', requestType: 'RECON_REOPEN' },
    orderBy: { requestedAt: 'asc' },
  });
  if (requests.length === 0) return requests;
  const statementIds = Array.from(new Set(requests.map((request) => request.entityId)));
  const statements = await prisma.statementUpload.findMany({
    where: { id: { in: statementIds } },
    select: { id: true, fileName: true, status: true, periodStart: true, periodEnd: true, matchedCount: true, totalTransactions: true },
  });
  const byId = new Map(statements.map((statement) => [statement.id, statement]));
  return requests.map((request) => ({
    ...request,
    statement: byId.get(request.entityId) ?? null,
  }));
}

export async function approveReopenReconciliation(approvalId: string, userId: string, comments?: string | null) {
  return prisma.$transaction(async (tx) => {
    const request = await tx.approvalRequest.findUnique({ where: { id: approvalId } });
    if (!request) throw new Error('Approval request not found');
    if (request.entityType !== 'StatementUpload' || request.requestType !== 'RECON_REOPEN') throw new Error('Invalid approval request type');
    if (request.status !== 'PENDING') throw new Error('Approval request is not pending');

    const statement: any = await tx.statementUpload.findUnique({
      where: { id: request.entityId },
      include: { items: { include: { matches: true } } },
    } as any);
    if (!statement) throw new Error('Statement upload not found');
    if (!['COMPLETED', 'REVIEWED'].includes(statement.status)) {
      throw new FinanceValidationError(
        'Statement is not in a reopenable status',
        'RECON_REOPEN_STATUS_INVALID',
        { statementUploadId: statement.id, currentStatus: statement.status },
      );
    }
    await assertReopenAllowedByPeriod(tx, statement, 'reconciliation:reopen-approve');

    const transactionIds = new Set<string>();
    for (const item of statement.items as any[]) {
      await refreshReconciliationItemStatus(tx, item.id, userId);
      for (const match of item.matches as any[]) {
        transactionIds.add(match.financeTransactionId);
      }
    }
    for (const transactionId of Array.from(transactionIds)) {
      await refreshFinanceTransactionStatus(tx, transactionId, userId);
    }
    await refreshStatementMatchCounts(tx, statement.id);

    const reopenedStatement = await tx.statementUpload.update({
      where: { id: statement.id },
      data: {
        status: 'IN_PROGRESS',
        reconciledById: null,
        reconciledAt: null,
        completedById: null,
        completedAt: null,
        notes: `${statement.notes ?? ''}${statement.notes ? ' | ' : ''}Reopened via approval ${approvalId} on ${new Date().toISOString()}.`,
      },
    });

    const updatedRequest = await tx.approvalRequest.update({
      where: { id: approvalId },
      data: {
        status: 'APPROVED',
        approvedById: userId,
        approvedAt: new Date(),
        comments: comments ?? request.comments,
      },
    });
    return { request: updatedRequest, statement: reopenedStatement };
  });
}

export async function rejectReopenReconciliation(approvalId: string, userId: string, comments?: string | null) {
  return prisma.$transaction(async (tx) => {
    const request = await tx.approvalRequest.findUnique({ where: { id: approvalId } });
    if (!request) throw new Error('Approval request not found');
    if (request.entityType !== 'StatementUpload' || request.requestType !== 'RECON_REOPEN') throw new Error('Invalid approval request type');
    if (request.status !== 'PENDING') throw new Error('Approval request is not pending');
    return tx.approvalRequest.update({
      where: { id: approvalId },
      data: {
        status: 'REJECTED',
        rejectedById: userId,
        rejectedAt: new Date(),
        comments: comments ?? request.comments,
      },
    });
  });
}

export async function getCommissionReceivableOptions(insurerId: string) {
  if (!insurerId) throw new Error('insurerId is required');
  return prisma.commissionEntry.findMany({
    where: {
      insurerId,
      insurerCommissionStatus: { in: ['RECEIVABLE', 'PARTIALLY_RECEIVED', 'OVERDUE'] },
      commissionReceivableAmount: { gt: 0 },
    },
    include: {
      policy: { include: { client: true } },
      insurer: true,
    },
    orderBy: { earnedDate: 'asc' },
  });
}

export async function getCommissionReceivables(req: AuthRequest) {
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(200, Math.max(10, parseInt(req.query.limit as string) || 30));
  const skip = (page - 1) * limit;
  const insurerId = req.query.insurerId as string | undefined;
  const status = req.query.status as string | undefined;
  const q = String(req.query.q ?? '').trim();
  const where: Prisma.CommissionEntryWhereInput = {
    ...(insurerId && { insurerId }),
    ...(status
      ? { insurerCommissionStatus: status as any }
      : {
          insurerCommissionStatus: {
            in: ['RECEIVABLE', 'PARTIALLY_RECEIVED', 'OVERDUE', 'RECEIVED', 'WRITTEN_OFF'],
          },
        }),
    ...(q
      ? {
          OR: [
            { policy: { policyNumber: { contains: q, mode: 'insensitive' } } },
            { policy: { client: { firstName: { contains: q, mode: 'insensitive' } } } },
            { policy: { client: { lastName: { contains: q, mode: 'insensitive' } } } },
            { policy: { client: { companyName: { contains: q, mode: 'insensitive' } } } },
            { insurer: { name: { contains: q, mode: 'insensitive' } } },
            { paymentReference: { contains: q, mode: 'insensitive' } },
          ],
        }
      : {}),
  };
  const [items, total] = await Promise.all([
    prisma.commissionEntry.findMany({
      where,
      skip,
      take: limit,
      include: { insurer: true, policy: { include: { client: true } }, agent: true, insurerCommissionReceipts: true },
      orderBy: { earnedDate: 'desc' },
    }),
    prisma.commissionEntry.count({ where }),
  ]);
  return { items, total, page, limit };
}

export async function recordCommissionReceipt(data: CommissionReceiptInput, userId: string) {
  return prisma.$transaction(async (tx) => {
    await assertOpenFinancialPeriodForPosting(tx, new Date(data.receivedDate), 'commission-receipt:record');
    await checkDuplicateReference(tx, {
      module: 'commissionReceipt',
      reference: data.reference,
      amount: data.amount,
      date: new Date(data.receivedDate),
      overrideReason: data.overrideReason,
    });
    const receipt = await tx.insurerCommissionReceipt.create({
      data: {
        receiptNumber: await nextNumber('insurerCommissionReceipt', 'receiptNumber', 'ICR', tx),
        insurerId: data.insurerId,
        commissionEntryId: data.commissionEntryId ?? null,
        amount: decimal(data.amount),
        currency: data.currency,
        receivedDate: new Date(data.receivedDate),
        method: data.method as any,
        reference: data.reference ?? null,
        notes: data.notes ?? null,
        createdById: userId,
      },
    });
    const entry = await postJournal(tx, {
      event: 'INSURER_COMMISSION_RECEIVED',
      entryDate: new Date(data.receivedDate),
      description: `Commission received from insurer`,
      reference: data.reference,
      source: { insurerId: data.insurerId, commissionEntryId: data.commissionEntryId ?? undefined },
      sourceKey: `insurer-commission-receipt:${receipt.id}`,
      userId,
      lines: [
        { accountCode: accountCodeForPayment(data.method), debit: data.amount },
        { accountCode: SYSTEM_ACCOUNTS.COMMISSION_RECEIVABLE_INSURERS, credit: data.amount },
      ],
    });
    if (data.commissionEntryId) {
      const commission = await tx.commissionEntry.findUnique({ where: { id: data.commissionEntryId } });
      if (commission) {
        const received = commission.commissionReceivedAmount.plus(data.amount);
        await tx.commissionEntry.update({
          where: { id: data.commissionEntryId },
          data: {
            commissionReceivedAmount: received,
            insurerCommissionStatus: received.gte(commission.commissionReceivableAmount) ? 'RECEIVED' : 'PARTIALLY_RECEIVED',
          },
        });
      }
    }
    await createFinanceTransaction(tx, {
      type: 'INSURER_COMMISSION_RECEIPT',
      transactionDate: new Date(data.receivedDate),
      description: 'Insurer commission received',
      reference: data.reference,
      amount: data.amount,
      direction: 'INFLOW',
      bankAccountId: data.bankAccountId,
      mpesaAccountId: data.mpesaAccountId,
      journalEntryId: entry.id,
      commissionEntryId: data.commissionEntryId,
      insurerCommissionReceiptId: receipt.id,
      insurerId: data.insurerId,
      userId,
    });
    return receipt;
  });
}

export async function getAgentPayables(req: AuthRequest) {
  const agentId = req.query.agentId as string | undefined;
  return prisma.commissionEntry.findMany({
    where: { ...(agentId && { agentId }), status: { in: ['APPROVED', 'PAYABLE', 'HELD'] } },
    include: { agent: true, policy: { include: { client: true } }, insurer: true },
    orderBy: { earnedDate: 'asc' },
  });
}

export async function payAgentCommissions(data: AgentPaymentBatchInput, userId: string) {
  return prisma.$transaction(async (tx) => {
    const entries = await tx.commissionEntry.findMany({ where: { id: { in: data.commissionEntryIds }, status: { in: ['APPROVED', 'PAYABLE'] } }, include: { agent: true } });
    if (entries.length !== data.commissionEntryIds.length) throw new Error('One or more commissions are not payable');
    const totalNet = entries.reduce((sum, entry) => sum.plus(entry.netCommission), new Decimal(0));
    const withholdingTax = entries.reduce((sum, entry) => sum.plus(entry.withholdingTax), new Decimal(0));
    const cashPaid = totalNet.minus(withholdingTax);
    const journal = await postJournal(tx, {
      event: 'AGENT_COMMISSION_PAID',
      entryDate: data.paidAt ? new Date(data.paidAt) : new Date(),
      description: `Agent commission payment batch`,
      reference: data.paymentReference,
      sourceKey: `agent-commission-paid:${data.paymentReference}`,
      userId,
      lines: [
        { accountCode: SYSTEM_ACCOUNTS.AGENT_COMMISSION_PAYABLE, debit: totalNet },
        { accountCode: accountCodeForPayment(data.paymentMethod), credit: cashPaid },
        ...(withholdingTax.gt(0) ? [{ accountCode: SYSTEM_ACCOUNTS.WITHHOLDING_TAX_PAYABLE, credit: withholdingTax }] : []),
      ],
    });
    for (const entry of entries) {
      await createFinanceTransaction(tx, {
        type: 'AGENT_COMMISSION_PAYMENT',
        transactionDate: data.paidAt ? new Date(data.paidAt) : new Date(),
        description: `Agent commission paid to ${entry.agent.firstName ?? entry.agent.companyName ?? entry.agent.email}`,
        reference: data.paymentReference,
        amount: entry.netCommission.minus(entry.withholdingTax),
        direction: 'OUTFLOW',
        bankAccountId: data.bankAccountId,
        mpesaAccountId: data.mpesaAccountId,
        journalEntryId: journal.id,
        commissionEntryId: entry.id,
        agentId: entry.agentId,
        userId,
      });
      await tx.commissionEntry.update({ where: { id: entry.id }, data: { status: 'PAID', paymentMethod: data.paymentMethod as any, paymentReference: data.paymentReference, paidAt: data.paidAt ? new Date(data.paidAt) : new Date() } });
    }
    return { paidCount: entries.length, totalNet, withholdingTax, cashPaid, journal };
  });
}

export async function getTrialBalance() {
  const accounts = await prisma.ledgerAccount.findMany({ where: { isActive: true }, include: { entries: true }, orderBy: { code: 'asc' } });
  const rows = accounts.map((account) => ({
    account,
    debit: account.entries.reduce((sum, line) => sum.plus(line.debit), new Decimal(0)),
    credit: account.entries.reduce((sum, line) => sum.plus(line.credit), new Decimal(0)),
  }));
  return {
    rows,
    totalDebit: rows.reduce((sum, row) => sum.plus(row.debit), new Decimal(0)),
    totalCredit: rows.reduce((sum, row) => sum.plus(row.credit), new Decimal(0)),
  };
}

export async function getGeneralLedger() {
  return prisma.ledgerAccount.findMany({
    where: { isActive: true },
    include: { entries: { include: { journalEntry: true }, orderBy: { journalEntry: { entryDate: 'desc' } } } },
    orderBy: { code: 'asc' },
  });
}

export async function getIncomeStatement() {
  const accounts = await prisma.ledgerAccount.findMany({ where: { type: { in: ['REVENUE', 'EXPENSE'] }, isActive: true }, include: { entries: true }, orderBy: { code: 'asc' } });
  const revenue = accounts.filter((a) => a.type === 'REVENUE').reduce((sum, account) => sum.plus(account.entries.reduce((s, line) => s.plus(line.credit.minus(line.debit)), new Decimal(0))), new Decimal(0));
  const expenses = accounts.filter((a) => a.type === 'EXPENSE').reduce((sum, account) => sum.plus(account.entries.reduce((s, line) => s.plus(line.debit.minus(line.credit)), new Decimal(0))), new Decimal(0));
  return { accounts, revenue, expenses, netIncome: revenue.minus(expenses) };
}

export async function getBalanceSheet() {
  const accounts = await prisma.ledgerAccount.findMany({ where: { type: { in: ['ASSET', 'LIABILITY', 'EQUITY'] }, isActive: true }, orderBy: { code: 'asc' } });
  return {
    assets: accounts.filter((a) => a.type === 'ASSET'),
    liabilities: accounts.filter((a) => a.type === 'LIABILITY'),
    equity: accounts.filter((a) => a.type === 'EQUITY'),
  };
}

export async function getInsurerPayablesAging() {
  const remittances = await prisma.insurerRemittance.findMany({ where: { status: { in: ['DRAFT', 'APPROVED', 'PARTIALLY_PAID'] } }, include: { insurer: true } });
  return agingRows(remittances.map((r) => ({ name: r.insurer.name, date: r.dueDate ?? r.remittanceDate, amount: r.netRemittanceAmount.minus(r.paidAmount) })));
}

export async function getCommissionReceivablesAging() {
  const entries = await prisma.commissionEntry.findMany({ where: { insurerCommissionStatus: { in: ['RECEIVABLE', 'PARTIALLY_RECEIVED', 'OVERDUE'] } }, include: { insurer: true } });
  return agingRows(entries.map((e) => ({ name: e.insurer?.name ?? 'Unassigned insurer', date: e.earnedDate, amount: e.commissionReceivableAmount.minus(e.commissionReceivedAmount) })));
}

export async function getAgentPayablesAging() {
  const entries = await prisma.commissionEntry.findMany({ where: { status: { in: ['APPROVED', 'PAYABLE', 'HELD'] } }, include: { agent: true } });
  return agingRows(entries.map((e) => ({ name: e.agent.companyName ?? (`${e.agent.firstName ?? ''} ${e.agent.lastName ?? ''}`.trim() || e.agent.email), date: e.earnedDate, amount: e.netCommission })));
}

function agingRows(rows: Array<{ name: string; date: Date; amount: Decimal }>) {
  const buckets = new Map<string, { name: string; current: number; days30: number; days60: number; days90: number; total: number }>();
  const today = new Date();
  rows.forEach((row) => {
    const age = Math.floor((today.getTime() - new Date(row.date).getTime()) / 86400000);
    const current = buckets.get(row.name) ?? { name: row.name, current: 0, days30: 0, days60: 0, days90: 0, total: 0 };
    const amount = asNumber(row.amount);
    if (age <= 30) current.current += amount;
    else if (age <= 60) current.days30 += amount;
    else if (age <= 90) current.days60 += amount;
    else current.days90 += amount;
    current.total += amount;
    buckets.set(row.name, current);
  });
  return Array.from(buckets.values()).sort((a, b) => b.total - a.total);
}

export async function getReport(name: string) {
  if (name === 'trial-balance') return getTrialBalance();
  if (name === 'general-ledger') return getGeneralLedger();
  if (name === 'income-statement') return getIncomeStatement();
  if (name === 'balance-sheet') return getBalanceSheet();
  if (name === 'insurer-payables-aging') return getInsurerPayablesAging();
  if (name === 'commission-receivables-aging') return getCommissionReceivablesAging();
  if (name === 'agent-payables-aging') return getAgentPayablesAging();
  if (name === 'direct-to-insurer-payments') return prisma.directInsurerPayment.findMany({ include: { client: true, insurer: true, policy: true }, orderBy: { paymentDate: 'desc' } });
  if (name === 'broker-collected-premium') return prisma.payment.findMany({ where: { premiumCollectionMode: 'BROKER_COLLECTED' }, include: { client: true, allocations: true }, orderBy: { paymentDate: 'desc' } });
  if (name === 'expenses') return prisma.expense.findMany({ include: { vendor: true, category: true }, orderBy: { expenseDate: 'desc' } });
  if (name === 'reconciliation') return listStatementUploads();
  return getTrialBalance();
}

