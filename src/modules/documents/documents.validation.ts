import { z } from 'zod';

const optionalUuid = z.string().uuid().optional().nullable();

export const documentUploadFieldsSchema = z.object({
  title: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  documentType: z.string().optional().nullable(),
  type: z.string().optional().nullable(),
  category: z.string().optional().nullable(),
  visibility: z.enum(['INTERNAL', 'CLIENT_VISIBLE', 'INSURER_VISIBLE']).optional().default('INTERNAL'),
  sourceModule: z.string().optional().nullable(),
  entityType: z.string().min(1).optional(),
  entityId: z.string().min(1).optional(),
  relatedEntityType: z.string().optional().nullable(),
  relatedEntityId: z.string().optional().nullable(),
  clientId: optionalUuid,
  policyId: optionalUuid,
  claimId: optionalUuid,
  paymentId: optionalUuid,
  onboardingCaseId: optionalUuid,
  expenseId: optionalUuid,
  insurerId: optionalUuid,
  parentDocumentId: optionalUuid,
  expiryDate: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional().nullable(),
  tags: z.union([z.array(z.string()), z.string()]).optional().nullable(),
  metadata: z.union([z.record(z.any()), z.string()]).optional().nullable(),
});

export const listDocumentsQuerySchema = z.object({
  page: z.string().optional(),
  limit: z.string().optional(),
  search: z.string().optional(),
  entityType: z.string().optional(),
  entityId: z.string().optional(),
  relatedEntityType: z.string().optional(),
  relatedEntityId: z.string().optional(),
  clientId: z.string().uuid().optional(),
  policyId: z.string().uuid().optional(),
  claimId: z.string().uuid().optional(),
  paymentId: z.string().uuid().optional(),
  onboardingCaseId: z.string().uuid().optional(),
  insurerId: z.string().uuid().optional(),
  status: z.string().optional(),
  documentType: z.string().optional(),
  sourceModule: z.string().optional(),
});

export const updateDocumentSchema = documentUploadFieldsSchema.partial().extend({
  status: z.enum(['DRAFT', 'UPLOADED', 'VERIFIED', 'REJECTED', 'EXPIRED', 'ARCHIVED', 'VOIDED']).optional(),
  name: z.string().optional(),
});

export const rejectDocumentSchema = z.object({
  reason: z.string().min(3, 'Rejection reason is required'),
  notes: z.string().optional().nullable(),
});

export const documentRequirementSchema = z.object({
  module: z.string().min(1),
  entityType: z.string().min(1),
  productId: optionalUuid,
  insuranceClass: z.string().optional().nullable(),
  clientType: z.string().optional().nullable(),
  claimType: z.string().optional().nullable(),
  documentType: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional().nullable(),
  isRequired: z.boolean().optional().default(true),
  isActive: z.boolean().optional().default(true),
  sortOrder: z.number().int().optional().default(0),
});

export const listRequirementsQuerySchema = z.object({
  module: z.string().optional(),
  entityType: z.string().optional(),
  productId: z.string().uuid().optional(),
  insuranceClass: z.string().optional(),
  clientType: z.string().optional(),
  claimType: z.string().optional(),
  isActive: z.string().optional(),
});

export type DocumentUploadFields = z.infer<typeof documentUploadFieldsSchema>;
export type DocumentRequirementInput = z.infer<typeof documentRequirementSchema>;
