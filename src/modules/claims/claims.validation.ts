import { z } from 'zod';

const dateString = z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/));
const money = z.number().nonnegative();

export const claimStatusSchema = z.enum([
  'REPORTED',
  'REGISTERED',
  'DOCUMENTS_PENDING',
  'DOCUMENTS_COMPLETE',
  'SUBMITTED_TO_INSURER',
  'UNDER_REVIEW',
  'ADDITIONAL_INFO_REQUESTED',
  'ASSESSED',
  'APPROVED',
  'PARTIALLY_APPROVED',
  'REJECTED',
  'APPEAL',
  'SETTLEMENT_PENDING',
  'PARTIALLY_SETTLED',
  'SETTLED',
  'CLOSED',
  'WITHDRAWN',
  'VOIDED',
]);

export const listClaimsSchema = z.object({
  page: z.string().optional(),
  limit: z.string().optional(),
  search: z.string().optional(),
  status: z.string().optional(),
  clientId: z.string().uuid().optional(),
  policyId: z.string().uuid().optional(),
  insurerId: z.string().uuid().optional(),
  productId: z.string().uuid().optional(),
  ownerId: z.string().uuid().optional(),
  priority: z.string().optional(),
  overdue: z.string().optional(),
  fraudFlag: z.string().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
});

export const createClaimSchema = z.object({
  policyId: z.string().uuid(),
  claimantName: z.string().min(1),
  claimantPhone: z.string().optional().nullable(),
  claimantEmail: z.string().email().optional().nullable(),
  claimantRelationship: z.string().optional().nullable(),
  dateOfLoss: dateString,
  dateReported: dateString.optional(),
  lossType: z.string().min(1),
  lossCategory: z.string().optional().nullable(),
  lossDescription: z.string().min(5),
  lossLocation: z.string().optional().nullable(),
  severity: z.enum(['MINOR', 'MODERATE', 'MAJOR', 'CATASTROPHIC']).optional(),
  priority: z.enum(['NORMAL', 'URGENT', 'VIP']).optional(),
  recoveryPotential: z.enum(['NONE', 'SUBROGATION', 'SALVAGE', 'BOTH']).optional(),
  amountClaimed: money.optional().default(0),
  excess: money.optional().nullable(),
  ownerId: z.string().uuid().optional().nullable(),
  notes: z.string().optional().nullable(),
  overridePolicyEligibility: z.boolean().optional().default(false),
  overrideReason: z.string().optional().nullable(),
  acknowledgeDuplicateWarning: z.boolean().optional().default(false),
});

export const updateClaimSchema = z.object({
  insurerClaimNumber: z.string().optional().nullable(),
  claimantName: z.string().min(1).optional(),
  claimantPhone: z.string().optional().nullable(),
  claimantEmail: z.string().email().optional().nullable(),
  claimantRelationship: z.string().optional().nullable(),
  lossType: z.string().optional(),
  lossCategory: z.string().optional().nullable(),
  lossDescription: z.string().optional(),
  lossLocation: z.string().optional().nullable(),
  severity: z.enum(['MINOR', 'MODERATE', 'MAJOR', 'CATASTROPHIC']).optional(),
  priority: z.enum(['NORMAL', 'URGENT', 'VIP']).optional(),
  recoveryPotential: z.enum(['NONE', 'SUBROGATION', 'SALVAGE', 'BOTH']).optional(),
  amountClaimed: money.optional(),
  amountAssessed: money.optional().nullable(),
  amountApproved: money.optional().nullable(),
  excess: money.optional().nullable(),
  fraudFlag: z.boolean().optional(),
  fraudNotes: z.string().optional().nullable(),
  rejectionReason: z.string().optional().nullable(),
  rejectionCategory: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export const assignClaimSchema = z.object({
  ownerId: z.string().uuid().nullable(),
  notes: z.string().optional().nullable(),
});

export const updateClaimStatusSchema = z.object({
  status: claimStatusSchema,
  reason: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  createFollowUpTask: z.boolean().optional().default(true),
});

export const documentSchema = z.object({
  requirementId: z.string().uuid().optional().nullable(),
  type: z.string().min(1),
  name: z.string().min(1),
  fileUrl: z.string().min(1),
  fileSize: z.number().int().nonnegative().default(0),
  mimeType: z.string().default('application/octet-stream'),
  notes: z.string().optional().nullable(),
});

export const updateDocumentSchema = z.object({
  type: z.string().optional(),
  name: z.string().optional(),
  fileUrl: z.string().optional(),
  fileSize: z.number().int().nonnegative().optional(),
  mimeType: z.string().optional(),
  status: z.enum(['PENDING', 'VERIFIED', 'REJECTED', 'EXPIRED']).optional(),
  notes: z.string().optional().nullable(),
});

export const rejectDocumentSchema = z.object({
  reason: z.string().min(3),
});

export const querySchema = z.object({
  source: z.enum(['INSURER', 'CLIENT', 'INTERNAL']),
  querySource: z.enum(['INSURER', 'CLIENT', 'INTERNAL']).optional(),
  queryType: z.enum(['DOCUMENT_REQUEST', 'CLARIFICATION', 'ASSESSMENT_QUERY', 'SETTLEMENT_QUERY', 'GENERAL']).optional(),
  queryText: z.string().min(3),
  requestedBy: z.string().optional().nullable(),
  raisedByName: z.string().optional().nullable(),
  raisedByUserId: z.string().uuid().optional().nullable(),
  raisedByExternalParty: z.string().optional().nullable(),
  requestedAt: dateString.optional(),
  dueDate: dateString.optional().nullable(),
  priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']).optional(),
  insurerReference: z.string().optional().nullable(),
  assignedToId: z.string().uuid().optional().nullable(),
});

export const updateQuerySchema = z.object({
  queryText: z.string().optional(),
  queryType: z.enum(['DOCUMENT_REQUEST', 'CLARIFICATION', 'ASSESSMENT_QUERY', 'SETTLEMENT_QUERY', 'GENERAL']).optional(),
  dueDate: dateString.optional().nullable(),
  priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']).optional(),
  status: z.enum(['OPEN', 'CLIENT_RESPONSE_PENDING', 'RESPONDED', 'SUBMITTED_TO_INSURER', 'CLOSED', 'OVERDUE']).optional(),
  insurerReference: z.string().optional().nullable(),
  assignedToId: z.string().uuid().optional().nullable(),
});

export const respondQuerySchema = z.object({
  responseSource: z.enum(['CLIENT', 'INSURER', 'INTERNAL']).optional(),
  responseText: z.string().min(3),
  respondedByName: z.string().optional().nullable(),
  responseDate: dateString.optional(),
  documentIds: z.array(z.string().uuid()).optional().default([]),
});

export const assessmentSchema = z.object({
  assessorName: z.string().optional().nullable(),
  assessorCompany: z.string().optional().nullable(),
  assessmentDate: dateString,
  assessedAmount: money.optional().nullable(),
  recommendedSettlement: money.optional().nullable(),
  reportDocumentId: z.string().uuid().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export const settlementSchema = z.object({
  amount: money,
  settlementDate: dateString.optional().nullable(),
  expectedPaymentDate: dateString.optional().nullable(),
  paymentReceivedDate: dateString.optional().nullable(),
  paymentMethod: z.string().optional().nullable(),
  paymentReference: z.string().optional().nullable(),
  paidTo: z.enum(['CLIENT', 'SERVICE_PROVIDER', 'BROKER', 'OTHER']).optional(),
  recipientName: z.string().optional().nullable(),
  status: z.enum(['EXPECTED', 'RECEIVED', 'DISBURSED', 'PARTIAL', 'CANCELLED']).optional(),
  notes: z.string().optional().nullable(),
  allowPreApprovalSettlement: z.boolean().optional().default(false),
  overrideApprovedAmount: z.boolean().optional().default(false),
  overrideReason: z.string().optional().nullable(),
});

export const taskSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional().nullable(),
  dueDate: dateString.optional().nullable(),
  priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']).optional(),
  assignedToId: z.string().uuid().optional().nullable(),
});

export type CreateClaimInput = z.infer<typeof createClaimSchema>;
export type UpdateClaimInput = z.infer<typeof updateClaimSchema>;
