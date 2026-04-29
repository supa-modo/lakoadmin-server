import { z } from 'zod';

const dateLike = z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/));
const optionalDate = dateLike.optional().nullable();
const paymentMethod = z.enum(['MPESA', 'BANK_TRANSFER', 'CHEQUE', 'CASH', 'CARD', 'DIRECT_DEBIT']);

export const manualJournalSchema = z.object({
  entryDate: dateLike,
  description: z.string().min(3),
  reference: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  lines: z.array(z.object({
    accountCode: z.string().min(3),
    debit: z.number().nonnegative().optional().default(0),
    credit: z.number().nonnegative().optional().default(0),
    description: z.string().optional().nullable(),
  })).min(2),
});

export const journalWorkflowSchema = z.object({
  comments: z.string().optional().nullable(),
});

export const createFinancialYearSchema = z.object({
  year: z.number().int().min(2000).max(2100),
  startDate: dateLike,
  endDate: dateLike,
});

export const updatePeriodStatusSchema = z.object({
  status: z.enum(['OPEN', 'LOCKED', 'CLOSED']),
  notes: z.string().optional().nullable(),
});

export const createLedgerAccountSchema = z.object({
  code: z.string().min(3).max(20),
  name: z.string().min(2),
  type: z.enum(['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE']),
  subtype: z.string().optional().nullable(),
  parentId: z.string().uuid().optional().nullable(),
  description: z.string().optional().nullable(),
});

export const updateLedgerAccountSchema = createLedgerAccountSchema.partial();

export const bankAccountSchema = z.object({
  accountName: z.string().min(2),
  accountNumber: z.string().min(2),
  bankName: z.string().min(2),
  branchName: z.string().optional().nullable(),
  swiftCode: z.string().optional().nullable(),
  currency: z.string().length(3).optional().default('KES'),
  accountType: z.enum(['TRUST', 'OPERATING', 'SAVINGS', 'PETTY_CASH', 'MPESA_PAYBILL', 'MPESA_TILL']),
  openingBalance: z.number().nonnegative().optional().default(0),
  currentBalance: z.number().nonnegative().optional(),
  ledgerAccountId: z.string().uuid().optional().nullable(),
  isDefault: z.boolean().optional().default(false),
  notes: z.string().optional().nullable(),
});

export const mpesaAccountSchema = z.object({
  accountName: z.string().min(2),
  shortCode: z.string().min(2),
  accountType: z.enum(['TRUST', 'OPERATING', 'MPESA_PAYBILL', 'MPESA_TILL']),
  currency: z.string().length(3).optional().default('KES'),
  openingBalance: z.number().nonnegative().optional().default(0),
  currentBalance: z.number().nonnegative().optional(),
  ledgerAccountId: z.string().uuid().optional().nullable(),
  isDefault: z.boolean().optional().default(false),
  notes: z.string().optional().nullable(),
});

export const vendorSchema = z.object({
  name: z.string().min(2),
  vendorType: z.string().optional().nullable(),
  contactPerson: z.string().optional().nullable(),
  email: z.string().email().optional().nullable(),
  phone: z.string().optional().nullable(),
  kraPin: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  paymentTerms: z.string().optional().nullable(),
  bankName: z.string().optional().nullable(),
  bankBranch: z.string().optional().nullable(),
  bankAccountName: z.string().optional().nullable(),
  bankAccountNumber: z.string().optional().nullable(),
  mpesaNumber: z.string().optional().nullable(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'SUSPENDED', 'ARCHIVED']).optional().default('ACTIVE'),
  notes: z.string().optional().nullable(),
});

export const createExpenseSchema = z.object({
  vendorId: z.string().uuid().optional().nullable(),
  categoryId: z.string().uuid(),
  expenseDate: dateLike,
  dueDate: optionalDate,
  description: z.string().min(3),
  amount: z.number().positive(),
  taxAmount: z.number().nonnegative().optional().default(0),
  currency: z.string().length(3).optional().default('KES'),
  receiptDocumentId: z.string().uuid().optional().nullable(),
  bankAccountId: z.string().uuid().optional().nullable(),
  mpesaAccountId: z.string().uuid().optional().nullable(),
  paymentMethod: paymentMethod.optional().nullable(),
  paymentReference: z.string().optional().nullable(),
  overrideReason: z.string().optional().nullable(),
  payImmediately: z.boolean().optional().default(false),
  notes: z.string().optional().nullable(),
});

export const submitExpenseSchema = z.object({
  notes: z.string().optional().nullable(),
});

export const rejectExpenseSchema = z.object({
  reason: z.string().min(3),
});

export const voidExpenseSchema = z.object({
  reason: z.string().min(3),
});

export const payExpenseSchema = z.object({
  paymentMethod: paymentMethod.optional().default('BANK_TRANSFER'),
  paymentReference: z.string().min(2),
  paidAt: dateLike.optional(),
  bankAccountId: z.string().uuid().optional().nullable(),
  mpesaAccountId: z.string().uuid().optional().nullable(),
  overrideReason: z.string().optional().nullable(),
});

export const createRemittanceSchema = z.object({
  insurerId: z.string().uuid(),
  policyIds: z.array(z.string().uuid()).min(1),
  settlementMode: z.enum(['DEDUCTED_AT_SOURCE', 'PAID_BY_INSURER', 'MANUAL']).default('DEDUCTED_AT_SOURCE'),
  remittanceDate: dateLike,
  dueDate: optionalDate,
  notes: z.string().optional().nullable(),
});

export const payRemittanceSchema = z.object({
  paymentMethod,
  paymentReference: z.string().min(2),
  paidAmount: z.number().positive(),
  paidAt: dateLike.optional(),
  bankAccountId: z.string().uuid().optional().nullable(),
  mpesaAccountId: z.string().uuid().optional().nullable(),
  overrideReason: z.string().optional().nullable(),
});

const statementRowSchema = z.object({
  transactionDate: dateLike,
  valueDate: optionalDate,
  description: z.string().min(1),
  reference: z.string().optional().nullable(),
  amount: z.number().positive(),
  isDebit: z.boolean(),
  runningBalance: z.number().optional().nullable(),
});

export const statementUploadSchema = z.object({
  bankAccountId: z.string().uuid().optional().nullable(),
  mpesaAccountId: z.string().uuid().optional().nullable(),
  statementType: z.enum(['BANK', 'MPESA']),
  fileName: z.string().min(2),
  fileUrl: z.string().optional().default('manual-upload'),
  periodStart: dateLike,
  periodEnd: dateLike,
  openingBalance: z.number(),
  closingBalance: z.number(),
  notes: z.string().optional().nullable(),
  preset: z.enum(['STRICT', 'RELAXED']).optional().default('STRICT'),
  rows: z.array(statementRowSchema).optional().default([]),
});

export const reconciliationMatchSchema = z.object({
  financeTransactionId: z.string().uuid(),
  matchAmount: z.number().positive().optional(),
  notes: z.string().optional().nullable(),
});

export const completeReconciliationSchema = z.object({
  notes: z.string().optional().nullable(),
});

export const requestReopenReconciliationSchema = z.object({
  reason: z.string().min(10),
  proposedChanges: z.string().optional().nullable(),
});

export const acceptHighConfidenceSchema = z.object({
  preset: z.enum(['STRICT', 'RELAXED']).optional().default('STRICT'),
  minScore: z.number().min(0).max(1).optional().default(0.9),
});

export const createMissingTransactionSchema = z.object({
  sourceMode: z.enum(['CREATE_SOURCE_RECORD', 'FINANCE_ONLY']).optional().default('FINANCE_ONLY'),
  transactionType: z.enum([
    'BROKER_PREMIUM_PAYMENT',
    'DIRECT_INSURER_ACKNOWLEDGEMENT',
    'INSURER_COMMISSION_RECEIPT',
    'AGENT_COMMISSION_PAYMENT',
    'EXPENSE_PAYMENT',
    'INSURER_REMITTANCE',
    'REFUND',
    'JOURNAL_ADJUSTMENT',
    'BANK_CHARGE',
    'MPESA_CHARGE',
    'OPENING_BALANCE',
    'OTHER_INFLOW',
    'OTHER_OUTFLOW',
  ]),
  description: z.string().min(3),
  reference: z.string().optional().nullable(),
  direction: z.enum(['INFLOW', 'OUTFLOW', 'NON_CASH']),
  accountId: z.string().uuid(),
  requireApproval: z.boolean().optional().default(false),
  notes: z.string().optional().nullable(),
  paymentMethod,
  expenseCategoryId: z.string().uuid().optional().nullable(),
  vendorId: z.string().uuid().optional().nullable(),
  taxAmount: z.number().nonnegative().optional().default(0),
  expenseId: z.string().uuid().optional().nullable(),
  remittanceId: z.string().uuid().optional().nullable(),
  commissionEntryId: z.string().uuid().optional().nullable(),
    insurerId: z.string().uuid().optional().nullable(),
    clientId: z.string().uuid().optional().nullable(),
    policyId: z.string().uuid().optional().nullable(),
    invoiceId: z.string().uuid().optional().nullable(),
  }).superRefine((value, ctx) => {
  if (value.sourceMode === 'CREATE_SOURCE_RECORD' && value.transactionType === 'EXPENSE_PAYMENT' && !value.expenseCategoryId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['expenseCategoryId'],
      message: 'Expense category is required when creating an expense from reconciliation',
    });
  }
  if (value.sourceMode === 'CREATE_SOURCE_RECORD' && value.transactionType === 'INSURER_REMITTANCE' && !value.remittanceId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['remittanceId'],
      message: 'Remittance ID is required when creating insurer remittance payment from reconciliation',
    });
  }
  if (value.sourceMode === 'CREATE_SOURCE_RECORD' && value.transactionType === 'INSURER_COMMISSION_RECEIPT' && !value.insurerId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['insurerId'],
      message: 'Insurer is required when creating commission receipt from reconciliation',
    });
  }
    if ((value.transactionType === 'OTHER_INFLOW' || value.transactionType === 'OTHER_OUTFLOW') && value.sourceMode === 'CREATE_SOURCE_RECORD') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['sourceMode'],
        message: 'Other inflow/outflow supports FINANCE_ONLY mode. Use a source-specific type where possible.',
      });
    }
    if (value.sourceMode === 'CREATE_SOURCE_RECORD' && value.transactionType === 'BROKER_PREMIUM_PAYMENT') {
      if (value.direction !== 'INFLOW') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['direction'],
          message: 'Broker premium payments must be recorded as INFLOW',
        });
      }
      if (!value.clientId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['clientId'],
          message: 'Client is required when creating broker premium payment from reconciliation',
        });
      }
      if (!value.policyId && !value.invoiceId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['policyId'],
          message: 'Policy or invoice is required when creating broker premium payment from reconciliation',
        });
      }
    }
    if (value.sourceMode === 'CREATE_SOURCE_RECORD' && value.transactionType === 'EXPENSE_PAYMENT' && value.direction !== 'OUTFLOW') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['direction'],
        message: 'Expense payments must be OUTFLOW',
      });
    }
    if (value.sourceMode === 'CREATE_SOURCE_RECORD' && value.transactionType === 'INSURER_REMITTANCE' && value.direction !== 'OUTFLOW') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['direction'],
        message: 'Insurer remittance payments must be OUTFLOW',
      });
    }
    if (value.sourceMode === 'CREATE_SOURCE_RECORD' && value.transactionType === 'INSURER_COMMISSION_RECEIPT' && value.direction !== 'INFLOW') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['direction'],
        message: 'Insurer commission receipts must be INFLOW',
      });
    }
  });

export const reverseFinanceTransactionSchema = z.object({
  reason: z.string().min(5),
  voidSourceRecord: z.boolean().optional().default(true),
});

export const unlinkReconciliationMatchSchema = z.object({
  reason: z.string().min(5),
});

export const reallocateReconciliationMatchSchema = z.object({
  targetFinanceTransactionId: z.string().uuid(),
  reallocatedAmount: z.number().positive().optional(),
  reason: z.string().min(5),
  notes: z.string().optional().nullable(),
});

export const approvalActionSchema = z.object({
  comments: z.string().optional().nullable(),
});

export const commissionReceiptSchema = z.object({
  insurerId: z.string().uuid(),
  commissionEntryId: z.string().uuid().optional().nullable(),
  amount: z.number().positive(),
  currency: z.string().length(3).optional().default('KES'),
  receivedDate: dateLike,
  method: paymentMethod,
  reference: z.string().optional().nullable(),
  bankAccountId: z.string().uuid().optional().nullable(),
  mpesaAccountId: z.string().uuid().optional().nullable(),
  overrideReason: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
}).superRefine((value, ctx) => {
  if (value.method === 'MPESA' && !value.mpesaAccountId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['mpesaAccountId'],
      message: 'M-Pesa account is required when payment method is MPESA',
    });
  }
  if (value.method !== 'MPESA' && !value.bankAccountId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['bankAccountId'],
      message: 'Bank account is required for non-M-Pesa commission receipts',
    });
  }
});

export const agentPaymentBatchSchema = z.object({
  commissionEntryIds: z.array(z.string().uuid()).min(1),
  paymentMethod,
  paymentReference: z.string().min(2),
  paidAt: dateLike.optional(),
  bankAccountId: z.string().uuid().optional().nullable(),
  mpesaAccountId: z.string().uuid().optional().nullable(),
});

export type ManualJournalInput = z.infer<typeof manualJournalSchema>;
export type CreateFinancialYearInput = z.infer<typeof createFinancialYearSchema>;
export type UpdatePeriodStatusInput = z.infer<typeof updatePeriodStatusSchema>;
export type CreateLedgerAccountInput = z.infer<typeof createLedgerAccountSchema>;
export type BankAccountInput = z.infer<typeof bankAccountSchema>;
export type MpesaAccountInput = z.infer<typeof mpesaAccountSchema>;
export type VendorInput = z.infer<typeof vendorSchema>;
export type CreateExpenseInput = z.infer<typeof createExpenseSchema>;
export type PayExpenseInput = z.infer<typeof payExpenseSchema>;
export type CreateRemittanceInput = z.infer<typeof createRemittanceSchema>;
export type PayRemittanceInput = z.infer<typeof payRemittanceSchema>;
export type StatementUploadInput = z.infer<typeof statementUploadSchema>;
export type ReconciliationPreset = z.infer<typeof statementUploadSchema>['preset'];
export type RequestReopenReconciliationInput = z.infer<typeof requestReopenReconciliationSchema>;
export type CreateMissingTransactionInput = z.infer<typeof createMissingTransactionSchema>;
export type ReverseFinanceTransactionInput = z.infer<typeof reverseFinanceTransactionSchema>;
export type UnlinkReconciliationMatchInput = z.infer<typeof unlinkReconciliationMatchSchema>;
export type ReallocateReconciliationMatchInput = z.infer<typeof reallocateReconciliationMatchSchema>;
export type CommissionReceiptInput = z.infer<typeof commissionReceiptSchema>;
export type AgentPaymentBatchInput = z.infer<typeof agentPaymentBatchSchema>;
