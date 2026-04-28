import { z } from 'zod';

export const createOnboardingSchema = z.object({
  clientId: z.string().uuid('Invalid client ID'),
  leadId: z.string().uuid().optional().nullable(),
  productId: z.string().uuid().optional().nullable(),
  insurerId: z.string().uuid().optional().nullable(),
  clientType: z.enum(['INDIVIDUAL', 'CORPORATE', 'SME', 'GROUP', 'GOVERNMENT']),
  premiumEstimate: z.number().nonnegative().optional().nullable(),
  riskDetails: z.record(z.any()).optional().nullable(),
  memberData: z.record(z.any()).optional().nullable(),
});

export const updateOnboardingSchema = z.object({
  leadId: z.string().uuid().optional().nullable(),
  productId: z.string().uuid().optional().nullable(),
  insurerId: z.string().uuid().optional().nullable(),
  premiumEstimate: z.number().nonnegative().optional().nullable(),
  riskDetails: z.record(z.any()).optional().nullable(),
  memberData: z.record(z.any()).optional().nullable(),
  status: z.enum([
    'DRAFT',
    'DOCUMENTS_PENDING',
    'UNDER_REVIEW',
    'INFORMATION_REQUESTED',
    'APPROVED',
    'REJECTED',
  ]).optional(),
  reviewNotes: z.string().optional().nullable(),
});

export const listOnboardingSchema = z.object({
  page: z.string().transform(Number).default('1'),
  limit: z.string().transform(Number).default('20'),
  status: z.enum([
    'DRAFT',
    'DOCUMENTS_PENDING',
    'UNDER_REVIEW',
    'INFORMATION_REQUESTED',
    'APPROVED',
    'REJECTED',
  ]).optional(),
  clientType: z.enum(['INDIVIDUAL', 'CORPORATE', 'SME', 'GROUP', 'GOVERNMENT']).optional(),
});

export const uploadDocumentSchema = z.object({
  documentType: z.string().min(1, 'Document type is required'),
  expiryDate: z.string().datetime().optional().nullable(),
});

export const verifyDocumentSchema = z.object({
  status: z.enum(['VERIFIED', 'REJECTED']),
  rejectionReason: z.string().optional().nullable(),
});

export const submitOnboardingSchema = z.object({}).optional();

export const approveOnboardingSchema = z.object({
  reviewNotes: z.string().optional().nullable(),
});

export const rejectOnboardingSchema = z.object({
  rejectionReason: z.string().min(1, 'Rejection reason is required'),
});

export const startClientOnboardingSchema = createOnboardingSchema.omit({ clientId: true }).partial();

export const createPolicyFromOnboardingSchema = z.object({
  startDate: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  endDate: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  sumInsured: z.number().positive().optional().nullable(),
  basePremium: z.number().nonnegative().optional(),
  policyFee: z.number().nonnegative().optional().default(0),
  paymentFrequency: z.enum(['ANNUAL', 'SEMI_ANNUAL', 'QUARTERLY', 'MONTHLY']).optional().default('ANNUAL'),
  insurerPolicyNumber: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  createUnderwriterTask: z.boolean().optional().default(true),
  underwriterFollowUpDueDate: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional(),
});
