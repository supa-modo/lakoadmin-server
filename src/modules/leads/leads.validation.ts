import { z } from 'zod';

/** Treat empty string as null so clients/forms don’t fail UUID validation on clear. */
const optionalUuidNullable = z.preprocess(
  (val) => (val === '' ? null : val),
  z.string().uuid().optional().nullable(),
);

export const createLeadSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Invalid email').optional().nullable(),
  phone: z.string().optional().nullable(),
  companyName: z.string().optional().nullable(),
  leadType: z
    .enum(['INDIVIDUAL', 'CORPORATE', 'SME', 'GROUP', 'GOVERNMENT'])
    .default('INDIVIDUAL'),
  source: z.string().optional().nullable(),
  sourceDetail: z.string().optional().nullable(),
  referrerId: z.preprocess(
    (val) => (val === '' ? null : val),
    z.string().uuid().optional().nullable(),
  ),
  priority: z.enum(['HOT', 'WARM', 'COLD']).default('WARM'),
  productsOfInterest: z.array(z.string()).default([]),
  expectedPremium: z.number().optional().nullable(),
  notes: z.string().optional().nullable(),
  nextFollowUp: z.string().datetime().optional().nullable(),
  assignedToId: optionalUuidNullable,
  proposalStatus: z.string().optional().nullable(),
  proposalDocumentId: z.string().optional().nullable(),
  proposalSentAt: z.string().datetime().optional().nullable(),
  proposalNotes: z.string().optional().nullable(),
});

export const updateLeadSchema = z.object({
  name: z.string().min(1, 'Name is required').optional(),
  email: z.string().email('Invalid email').optional().nullable(),
  phone: z.string().optional().nullable(),
  companyName: z.string().optional().nullable(),
  leadType: z.enum(['INDIVIDUAL', 'CORPORATE', 'SME', 'GROUP', 'GOVERNMENT']).optional(),
  source: z.string().optional().nullable(),
  sourceDetail: z.string().optional().nullable(),
  referrerId: z.preprocess(
    (val) => (val === '' ? null : val),
    z.string().uuid().optional().nullable(),
  ),
  priority: z.enum(['HOT', 'WARM', 'COLD']).optional(),
  productsOfInterest: z.array(z.string()).optional(),
  expectedPremium: z.number().optional().nullable(),
  notes: z.string().optional().nullable(),
  nextFollowUp: z.string().datetime().optional().nullable(),
  assignedToId: optionalUuidNullable,
  proposalStatus: z.string().optional().nullable(),
  proposalDocumentId: z.string().optional().nullable(),
  proposalSentAt: z.string().datetime().optional().nullable(),
  proposalNotes: z.string().optional().nullable(),
});

export const listLeadsSchema = z.object({
  page: z.string().transform(Number).default('1'),
  limit: z.string().transform(Number).default('20'),
  search: z.string().optional(),
  status: z.enum(['NEW', 'CONTACTED', 'QUALIFIED', 'PROPOSAL_SENT', 'NEGOTIATING', 'WON', 'LOST', 'DORMANT']).optional(),
  priority: z.enum(['HOT', 'WARM', 'COLD']).optional(),
  assignedTo: z.string().uuid().optional(),
  groupByStatus: z.enum(['true', 'false']).optional(),
});

export const assignLeadSchema = z.object({
  assignedToId: z.string().uuid('Invalid user ID'),
});

export const updateStatusSchema = z.object({
  status: z.enum(['NEW', 'CONTACTED', 'QUALIFIED', 'PROPOSAL_SENT', 'NEGOTIATING', 'WON', 'LOST', 'DORMANT']),
  lostReason: z.string().optional().nullable(),
});

export const convertToClientSchema = z.object({
  clientType: z.enum(['INDIVIDUAL', 'CORPORATE', 'SME', 'GROUP', 'GOVERNMENT']).optional(),
  relationshipManagerId: z.preprocess(
    (val) => (val === '' ? null : val),
    z.string().uuid().optional().nullable(),
  ),
  dependents: z.array(z.object({
    firstName: z.string().min(1, 'First name is required'),
    lastName: z.string().optional().nullable(),
    dateOfBirth: z.string().optional().nullable(),
    gender: z.string().optional().nullable(),
    relationship: z.enum(['SPOUSE', 'CHILD', 'PARENT', 'SIBLING', 'OTHER']),
    nationalId: z.string().optional().nullable(),
    passportNumber: z.string().optional().nullable(),
    notes: z.string().optional().nullable(),
  })).optional().default([]),
  createPolicy: z.boolean().optional().default(false),
  policy: z.object({
    productId: z.string().uuid(),
    insurerId: z.string().uuid(),
    startDate: z.string(),
    endDate: z.string(),
    basePremium: z.number().positive(),
    sumInsured: z.number().optional().nullable(),
    coverType: z.string().optional().nullable(),
    premiumCollectionMode: z.enum(['BROKER_COLLECTED', 'DIRECT_TO_INSURER', 'MIXED']).default('BROKER_COLLECTED'),
  }).optional().nullable(),
});

export const logActivitySchema = z.object({
  type: z.string().min(1, 'Activity type is required'),
  description: z.string().min(1, 'Description is required'),
  metadata: z.record(z.any()).optional().nullable(),
});

export const leadDependentSchema = z.object({
  firstName: z.string().trim().min(1, 'First name is required'),
  lastName: z.string().trim().optional().nullable(),
  dateOfBirth: z.string().optional().nullable(),
  gender: z.string().optional().nullable(),
  relationship: z.string().trim().min(1, 'Relationship is required'),
  nationalId: z.string().optional().nullable(),
  passportNumber: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export const createLeadDependentSchema = leadDependentSchema;
export const updateLeadDependentSchema = leadDependentSchema.partial();

export const createLeadCommunicationSchema = z.object({
  channel: z.enum(['EMAIL', 'PHONE', 'SMS', 'WHATSAPP', 'MEETING', 'OTHER']),
  direction: z.enum(['INBOUND', 'OUTBOUND']),
  subject: z.string().optional().nullable(),
  body: z.string().optional().nullable(),
  occurredAt: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}/)),
});

export const updateLeadProposalSchema = z.object({
  proposalStatus: z.string().optional().nullable(),
  proposalDocumentId: z.string().optional().nullable(),
  proposalSentAt: z.string().datetime().optional().nullable(),
  proposalNotes: z.string().optional().nullable(),
});
