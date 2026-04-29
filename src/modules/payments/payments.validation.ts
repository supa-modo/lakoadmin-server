import { z } from 'zod';

const dateLike = z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/));

export const paymentMethodSchema = z.enum([
  'MPESA',
  'BANK_TRANSFER',
  'CHEQUE',
  'CASH',
  'CARD',
  'DIRECT_DEBIT',
]);

export const paymentStatusSchema = z.enum([
  'PENDING',
  'VERIFIED',
  'ALLOCATED',
  'COMPLETED',
  'FAILED',
  'REVERSED',
  'REFUNDED',
]);

export const premiumCollectionModeSchema = z.enum([
  'BROKER_COLLECTED',
  'DIRECT_TO_INSURER',
  'MIXED',
]);

export const directInsurerPaymentStatusSchema = z.enum([
  'UNVERIFIED',
  'VERIFIED',
  'REJECTED',
  'PARTIALLY_VERIFIED',
]);

export const paymentAllocationInputSchema = z.object({
  policyId: z.string().uuid().optional().nullable(),
  invoiceId: z.string().uuid().optional().nullable(),
  amount: z.number().positive('Allocation amount must be greater than zero'),
  notes: z.string().optional().nullable(),
}).refine((value) => value.policyId || value.invoiceId, {
  message: 'Allocation must reference a policy or invoice',
});

export const recordPaymentSchema = z.object({
  clientId: z.string().uuid('Invalid client ID'),
  amount: z.number().positive('Payment amount must be greater than zero'),
  currency: z.string().length(3).optional().default('KES'),
  premiumCollectionMode: premiumCollectionModeSchema.optional().default('BROKER_COLLECTED'),
  method: paymentMethodSchema,
  reference: z.string().optional().nullable(),
  transactionCode: z.string().optional().nullable(),
  paymentDate: dateLike,
  receivedDate: dateLike.optional(),
  bankAccountId: z.string().uuid().optional().nullable(),
  mpesaAccountId: z.string().uuid().optional().nullable(),
  notes: z.string().optional().nullable(),
  autoVerify: z.boolean().optional().default(true),
  allocations: z.array(paymentAllocationInputSchema).optional().default([]),
  mpesa: z.object({
    merchantRequestId: z.string().optional().nullable(),
    checkoutRequestId: z.string().optional().nullable(),
    conversationId: z.string().optional().nullable(),
    originatorConversationId: z.string().optional().nullable(),
    phoneNumber: z.string().optional().nullable(),
    accountReference: z.string().optional().nullable(),
    resultCode: z.string().optional().nullable(),
    resultDescription: z.string().optional().nullable(),
    rawPayload: z.record(z.any()).optional().nullable(),
  }).optional(),
}).refine((value) => value.method !== 'MPESA' || !!value.transactionCode, {
  message: 'M-Pesa payments require a transaction code',
  path: ['transactionCode'],
});

export const recordDirectInsurerPaymentSchema = z.object({
  policyId: z.string().uuid('Invalid policy ID'),
  amount: z.number().positive('Payment amount must be greater than zero'),
  currency: z.string().length(3).optional().default('KES'),
  paymentDate: dateLike,
  method: paymentMethodSchema,
  insurerReference: z.string().min(2, 'Insurer reference is required'),
  notes: z.string().optional().nullable(),
  proofOfPaymentDocumentId: z.string().uuid().optional().nullable(),
  verificationStatus: directInsurerPaymentStatusSchema.optional().default('UNVERIFIED'),
  generateAcknowledgement: z.boolean().optional().default(true),
});

export const verifyDirectInsurerPaymentSchema = z.object({
  verificationStatus: z.enum(['VERIFIED', 'REJECTED', 'PARTIALLY_VERIFIED']),
  rejectionReason: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
}).refine((value) => value.verificationStatus !== 'REJECTED' || !!value.rejectionReason, {
  message: 'Rejection reason is required when rejecting a direct insurer payment',
  path: ['rejectionReason'],
});

export const allocatePaymentSchema = z.object({
  allocations: z.array(paymentAllocationInputSchema).min(1, 'Provide at least one allocation'),
});

export const verifyPaymentSchema = z.object({
  notes: z.string().optional().nullable(),
}).optional();

export const reversePaymentSchema = z.object({
  reason: z.string().min(5, 'Reversal reason must be at least 5 characters'),
});

export const failPaymentSchema = z.object({
  reason: z.string().min(5, 'Failure reason must be at least 5 characters'),
});

export const createInvoiceLineSchema = z.object({
  description: z.string().min(2),
  quantity: z.number().int().positive().optional().default(1),
  unitPrice: z.number().nonnegative(),
  policyId: z.string().uuid().optional().nullable(),
});

export const createInvoiceSchema = z.object({
  clientId: z.string().uuid(),
  insurerId: z.string().uuid().optional().nullable(),
  invoiceDate: dateLike,
  dueDate: dateLike,
  paymentTerms: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  lines: z.array(createInvoiceLineSchema).min(1),
});

export const listPaymentsQuerySchema = z.object({
  page: z.string().optional(),
  limit: z.string().optional(),
  search: z.string().optional(),
  status: paymentStatusSchema.optional(),
  method: paymentMethodSchema.optional(),
  clientId: z.string().uuid().optional(),
  policyId: z.string().uuid().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
});

export type RecordPaymentInput = z.infer<typeof recordPaymentSchema>;
export type RecordDirectInsurerPaymentInput = z.infer<typeof recordDirectInsurerPaymentSchema>;
export type VerifyDirectInsurerPaymentInput = z.infer<typeof verifyDirectInsurerPaymentSchema>;
export type AllocatePaymentInput = z.infer<typeof allocatePaymentSchema>;
export type ReversePaymentInput = z.infer<typeof reversePaymentSchema>;
export type FailPaymentInput = z.infer<typeof failPaymentSchema>;
export type CreateInvoiceInput = z.infer<typeof createInvoiceSchema>;
export type PaymentAllocationInput = z.infer<typeof paymentAllocationInputSchema>;
