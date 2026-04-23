import { z } from 'zod';

export const createOnboardingSchema = z.object({
  body: z.object({
    clientId: z.string().uuid('Invalid client ID'),
    clientType: z.enum(['INDIVIDUAL', 'CORPORATE', 'SME', 'GROUP', 'GOVERNMENT']),
  }),
});

export const updateOnboardingSchema = z.object({
  body: z.object({
    status: z.enum([
      'DRAFT',
      'DOCUMENTS_PENDING',
      'UNDER_REVIEW',
      'INFORMATION_REQUESTED',
      'APPROVED',
      'REJECTED',
    ]).optional(),
    reviewNotes: z.string().optional().nullable(),
  }),
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
  body: z.object({
    documentType: z.string().min(1, 'Document type is required'),
    expiryDate: z.string().datetime().optional().nullable(),
  }),
});

export const verifyDocumentSchema = z.object({
  body: z.object({
    status: z.enum(['VERIFIED', 'REJECTED']),
    rejectionReason: z.string().optional().nullable(),
  }),
});

export const submitOnboardingSchema = z.object({
  body: z.object({
    // No additional data needed
  }),
});

export const approveOnboardingSchema = z.object({
  body: z.object({
    reviewNotes: z.string().optional().nullable(),
  }),
});

export const rejectOnboardingSchema = z.object({
  body: z.object({
    rejectionReason: z.string().min(1, 'Rejection reason is required'),
  }),
});
