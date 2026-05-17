import { z } from 'zod';

export const createCommissionQuoteSchema = z.object({
  body: z.object({
    policyId: z.string().uuid(),
    expectedCommissionRate: z.number().min(0).max(1).optional(),
    notes: z.string().optional(),
  }),
});

export const updateCommissionQuoteSchema = z.object({
  body: z.object({
    expectedCommissionRate: z.number().min(0).max(1).optional(),
    expectedWhtRate: z.number().min(0).max(1).optional(),
    notes: z.string().optional(),
    reason: z.string().min(1, 'Reason required for edits'),
  }),
});

export const reconcileCommissionQuoteSchema = z.object({
  body: z.object({
    statementLineId: z.string().uuid(),
    reconciledGrossCommission: z.number().positive(),
    reconciledWhtAmount: z.number().min(0),
    reconciledNetCommission: z.number().positive(),
    reason: z.string().min(1, 'Reconciliation reason required'),
    notes: z.string().optional(),
  }),
});

export const createCommissionInvoiceSchema = z.object({
  body: z.object({
    quoteId: z.string().uuid(),
    etimsInvoiceNumber: z.string().optional(),
    invoiceDate: z.string().datetime(),
    invoiceDocumentId: z.string().uuid().optional(),
    notes: z.string().optional(),
  }),
});

export const recordCommissionPaymentSchema = z.object({
  body: z.object({
    quoteId: z.string().uuid(),
    amount: z.number().positive(),
    paymentDate: z.string().datetime(),
    paymentMethod: z.enum(['BANK_TRANSFER', 'MPESA', 'CHEQUE', 'CASH', 'OTHER']),
    transactionReference: z.string().optional(),
    bankAccountId: z.string().uuid().optional(),
    mpesaAccountId: z.string().uuid().optional(),
    proofDocumentId: z.string().uuid().optional(),
    notes: z.string().optional(),
  }),
});

export const uploadInsurerStatementSchema = z.object({
  body: z.object({
    insurerId: z.string().uuid(),
    statementDate: z.string().datetime(),
    periodStart: z.string().datetime(),
    periodEnd: z.string().datetime(),
    statementDocumentId: z.string().uuid().optional(),
    lines: z.array(
      z.object({
        policyNumber: z.string().optional(),
        clientName: z.string().optional(),
        productName: z.string().optional(),
        premiumAmount: z.number().optional(),
        grossCommission: z.number().positive(),
        whtAmount: z.number().min(0),
        netCommission: z.number().positive(),
        notes: z.string().optional(),
      })
    ).min(1),
    notes: z.string().optional(),
  }),
});

export const matchStatementLineSchema = z.object({
  body: z.object({
    statementLineId: z.string().uuid(),
    commissionQuoteId: z.string().uuid(),
  }),
});

export type CreateCommissionQuoteInput = z.infer<typeof createCommissionQuoteSchema>['body'];
export type UpdateCommissionQuoteInput = z.infer<typeof updateCommissionQuoteSchema>['body'];
export type ReconcileCommissionQuoteInput = z.infer<typeof reconcileCommissionQuoteSchema>['body'];
export type CreateCommissionInvoiceInput = z.infer<typeof createCommissionInvoiceSchema>['body'];
export type RecordCommissionPaymentInput = z.infer<typeof recordCommissionPaymentSchema>['body'];
export type UploadInsurerStatementInput = z.infer<typeof uploadInsurerStatementSchema>['body'];
export type MatchStatementLineInput = z.infer<typeof matchStatementLineSchema>['body'];
