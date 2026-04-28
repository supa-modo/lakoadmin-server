import { z } from 'zod';

// ─── Policy ───────────────────────────────────────────────

export const createPolicySchema = z.object({
  clientId: z.string().uuid('Invalid client ID'),
  productId: z.string().uuid('Invalid product ID'),
  insurerId: z.string().uuid('Invalid insurer ID'),
  agentId: z.string().uuid().optional().nullable(),
  onboardingCaseId: z.string().uuid().optional().nullable(),
  sourceLeadId: z.string().uuid().optional().nullable(),
  insurerPolicyNumber: z.string().optional().nullable(),

  startDate: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  endDate: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),

  sumInsured: z.number().positive().optional().nullable(),

  basePremium: z.number().nonnegative('Base premium must be non-negative'),
  trainingLevy: z.number().nonnegative().optional().default(0),
  pcifLevy: z.number().nonnegative().optional().default(0),
  stampDuty: z.number().nonnegative().optional().default(0),
  policyFee: z.number().nonnegative().optional().default(0),

  paymentFrequency: z.enum(['ANNUAL', 'SEMI_ANNUAL', 'QUARTERLY', 'MONTHLY']).optional().default('ANNUAL'),

  notes: z.string().optional().nullable(),
});

export const updatePolicySchema = z.object({
  insurerPolicyNumber: z.string().optional().nullable(),
  agentId: z.string().uuid().optional().nullable(),
  startDate: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional(),
  endDate: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional(),
  sumInsured: z.number().positive().optional().nullable(),
  basePremium: z.number().nonnegative().optional(),
  trainingLevy: z.number().nonnegative().optional(),
  pcifLevy: z.number().nonnegative().optional(),
  stampDuty: z.number().nonnegative().optional(),
  policyFee: z.number().nonnegative().optional(),
  paymentFrequency: z.enum(['ANNUAL', 'SEMI_ANNUAL', 'QUARTERLY', 'MONTHLY']).optional(),
  notes: z.string().optional().nullable(),
});

export const suspendPolicySchema = z.object({
  reason: z.string().min(5, 'Suspension reason must be at least 5 characters'),
});

export const cancelPolicySchema = z.object({
  reason: z.string().min(5, 'Cancellation reason must be at least 5 characters'),
});

export const activatePolicySchema = z.object({
  underwritingStatus: z.enum(['APPROVED', 'REFERRED']).optional(),
}).optional();

export const reinstatePolicySchema = z.object({
  reason: z.string().optional(),
}).optional();

// ─── List/filter query ────────────────────────────────────

export const listPoliciesQuerySchema = z.object({
  page: z.string().optional(),
  limit: z.string().optional(),
  search: z.string().optional(),
  status: z.string().optional(),
  clientId: z.string().uuid().optional(),
  insurerId: z.string().uuid().optional(),
  productId: z.string().uuid().optional(),
  agentId: z.string().uuid().optional(),
  paymentFrequency: z.string().optional(),
  startDateFrom: z.string().optional(),
  startDateTo: z.string().optional(),
  endDateFrom: z.string().optional(),
  endDateTo: z.string().optional(),
  expiringInDays: z.string().optional(),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
});

// ─── Members ──────────────────────────────────────────────

export const createMemberSchema = z.object({
  name: z.string().min(1, 'Member name is required'),
  dateOfBirth: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional().nullable(),
  gender: z.enum(['MALE', 'FEMALE', 'OTHER']).optional().nullable(),
  idNumber: z.string().optional().nullable(),
  relationship: z.string().min(1, 'Relationship is required'),
  coverageLevel: z.string().optional().nullable(),
  effectiveDate: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  terminationDate: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional().nullable(),
  premiumAmount: z.number().nonnegative().optional().nullable(),
  status: z.enum(['ACTIVE', 'TERMINATED', 'SUSPENDED']).optional().default('ACTIVE'),
});

export const updateMemberSchema = createMemberSchema.partial();

// ─── Endorsements ─────────────────────────────────────────

export const createEndorsementSchema = z.object({
  type: z.enum(['EXTENSION', 'REDUCTION', 'ALTERATION', 'CERTIFICATE', 'CANCELLATION', 'REINSTATEMENT']),
  effectiveDate: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  description: z.string().min(5, 'Description must be at least 5 characters'),
  beforeValues: z.record(z.any()).optional().nullable(),
  afterValues: z.record(z.any()).optional().nullable(),
  premiumChange: z.number().optional().default(0),
  notes: z.string().optional().nullable(),
});

export const rejectEndorsementSchema = z.object({
  reason: z.string().min(5, 'Rejection reason must be at least 5 characters'),
});

// ─── Documents ────────────────────────────────────────────

export const generateDocumentSchema = z.object({
  type: z.enum(['POLICY_SCHEDULE', 'DEBIT_NOTE', 'CERTIFICATE', 'ENDORSEMENT_NOTICE']),
});

export const uploadDocumentSchema = z.object({
  type: z.enum(['POLICY_SCHEDULE', 'DEBIT_NOTE', 'CERTIFICATE', 'ENDORSEMENT_NOTICE', 'TERMS_AND_CONDITIONS', 'CLAIM_FORM', 'OTHER']),
  name: z.string().optional(),
});

// ─── Renewals ─────────────────────────────────────────────

export const createRenewalSchema = z.object({
  startDate: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  endDate: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  basePremium: z.number().nonnegative(),
  trainingLevy: z.number().nonnegative().optional().default(0),
  pcifLevy: z.number().nonnegative().optional().default(0),
  stampDuty: z.number().nonnegative().optional().default(0),
  policyFee: z.number().nonnegative().optional().default(0),
  sumInsured: z.number().positive().optional().nullable(),
  paymentFrequency: z.enum(['ANNUAL', 'SEMI_ANNUAL', 'QUARTERLY', 'MONTHLY']).optional(),
  notes: z.string().optional().nullable(),
});

export const listRenewalsQuerySchema = z.object({
  page: z.string().optional(),
  limit: z.string().optional(),
  daysAhead: z.string().optional(),
  insurerId: z.string().uuid().optional(),
  agentId: z.string().uuid().optional(),
  status: z.string().optional(),
});

// ─── Exported types ───────────────────────────────────────

export type CreatePolicyInput = z.infer<typeof createPolicySchema>;
export type UpdatePolicyInput = z.infer<typeof updatePolicySchema>;
export type SuspendPolicyInput = z.infer<typeof suspendPolicySchema>;
export type CancelPolicyInput = z.infer<typeof cancelPolicySchema>;
export type CreateMemberInput = z.infer<typeof createMemberSchema>;
export type UpdateMemberInput = z.infer<typeof updateMemberSchema>;
export type CreateEndorsementInput = z.infer<typeof createEndorsementSchema>;
export type RejectEndorsementInput = z.infer<typeof rejectEndorsementSchema>;
export type GenerateDocumentInput = z.infer<typeof generateDocumentSchema>;
export type CreateRenewalInput = z.infer<typeof createRenewalSchema>;
