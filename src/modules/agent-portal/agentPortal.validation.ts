import { z } from 'zod';

const leadStatusEnum = z.enum([
  'NEW',
  'CONTACTED',
  'QUALIFIED',
  'PROPOSAL_SENT',
  'NEGOTIATING',
  'WON',
  'LOST',
  'DORMANT',
]);

const leadStageEnum = z.enum(['NEW', 'CONTACTED', 'QUALIFIED', 'PROPOSAL_SENT', 'NEGOTIATING', 'READY_FOR_ONBOARDING', 'LOST']);

const clientTypeEnum = z.enum(['INDIVIDUAL', 'CORPORATE', 'SME', 'GROUP', 'GOVERNMENT']);

export const updateAgentProfileSchema = z.object({
  phone: z.string().min(7).max(20).optional(),
  email: z.string().email().optional(),
  address: z.string().max(500).optional().nullable(),
  profilePhotoUrl: z.string().url().optional().nullable(),
  bankName: z.string().max(120).optional().nullable(),
  bankBranch: z.string().max(120).optional().nullable(),
  bankAccountName: z.string().max(120).optional().nullable(),
  bankAccountNumber: z.string().max(60).optional().nullable(),
  mpesaNumber: z.string().max(20).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  notificationPreferences: z.array(z.object({
    channel: z.enum(['EMAIL', 'SMS', 'WHATSAPP', 'IN_APP', 'INTERNAL_NOTIFICATION']),
    category: z.enum([
      'GENERAL',
      'INTERNAL',
      'CLIENT_WELCOME',
      'ONBOARDING_DOCUMENT_REQUEST',
      'POLICY_CREATED',
      'POLICY_ACTIVATED',
      'POLICY_RENEWAL_REMINDER',
      'PAYMENT_REMINDER',
      'PAYMENT_RECEIPT',
      'DIRECT_INSURER_PAYMENT_ACKNOWLEDGEMENT',
      'CLAIM_REGISTERED',
      'CLAIM_DOCUMENT_REQUEST',
      'CLAIM_SUBMITTED',
      'CLAIM_STATUS_UPDATE',
      'CLAIM_SETTLEMENT_UPDATE',
      'TASK_REMINDER',
    ]),
    isOptedIn: z.boolean(),
  })).optional(),
});

const agentLeadBaseSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
  email: z.string().email().optional().nullable(),
  phone: z.string().min(7).max(20),
  companyName: z.string().max(200).optional().nullable(),
  location: z.string().max(120).optional().nullable(),
  county: z.string().max(120).optional().nullable(),
  occupation: z.string().max(160).optional().nullable(),
  business: z.string().max(200).optional().nullable(),
  leadType: clientTypeEnum.optional(),
  source: z.string().max(100).optional().nullable(),
  sourceDetail: z.string().max(200).optional().nullable(),
  priority: z.enum(['HOT', 'WARM', 'COLD']).optional(),
  productsOfInterest: z.array(z.string()).optional(),
  productCategory: z.string().max(120).optional().nullable(),
  productInterested: z.string().max(160).optional().nullable(),
  preferredInsurer: z.string().max(160).optional().nullable(),
  expectedPremium: z.number().nonnegative().optional().nullable(),
  budgetRange: z.string().max(120).optional().nullable(),
  expectedStartDate: z.string().datetime().optional().nullable(),
  preferredContactMethod: z.string().max(80).optional().nullable(),
  notes: z.string().max(5000).optional().nullable(),
  nextFollowUp: z.string().datetime().optional().nullable(),
});

export const createAgentLeadSchema = agentLeadBaseSchema.superRefine((value, ctx) => {
  if (!value.name && (!value.firstName || !value.lastName)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Provide either name or both firstName and lastName',
      path: ['firstName'],
    });
  }
});

export const updateAgentLeadSchema = agentLeadBaseSchema.partial().extend({
  status: leadStatusEnum.optional(),
  stage: leadStageEnum.optional().nullable(),
  lostReason: z.string().max(500).optional().nullable(),
});

export const createLeadCommunicationSchema = z.object({
  communicationType: z.enum(['CALL', 'SMS', 'EMAIL', 'WHATSAPP', 'MEETING', 'NOTE']).default('NOTE'),
  direction: z.enum(['INBOUND', 'OUTBOUND']).default('OUTBOUND'),
  subject: z.string().max(300).optional().nullable(),
  message: z.string().min(1).max(10000),
  body: z.string().max(10000).optional().nullable(),
  outcome: z.enum([
    'INTERESTED',
    'REQUESTED_PROPOSAL',
    'NEEDS_FOLLOW_UP',
    'NOT_REACHABLE',
    'NOT_INTERESTED',
    'READY_TO_ONBOARD',
    'OTHER',
  ]).optional().nullable(),
  followUpRequired: z.boolean().optional(),
  followUpDate: z.string().datetime().optional().nullable(),
  occurredAt: z.string().datetime().optional(),
  createTask: z.boolean().optional(),
  taskTitle: z.string().max(200).optional().nullable(),
});

export const createLeadProposalSchema = z.object({
  productId: z.string().uuid().optional().nullable(),
  insurerId: z.string().uuid().optional().nullable(),
  premiumAmount: z.number().positive(),
  coverSummary: z.string().max(5000).optional().nullable(),
  benefitsSummary: z.string().max(5000).optional().nullable(),
  exclusionsSummary: z.string().max(5000).optional().nullable(),
  documentUrl: z.string().url().optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});

export const updateLeadProposalSchema = createLeadProposalSchema.partial().extend({
  rejectionReason: z.string().max(2000).optional().nullable(),
});

export const rejectLeadProposalSchema = z.object({
  rejectionReason: z.string().min(1).max(2000).optional(),
  notes: z.string().min(1).max(2000).optional(),
});

export const convertAgentLeadSchema = z.object({
  client: z.object({
    clientType: clientTypeEnum.optional(),
    firstName: z.string().max(100).optional().nullable(),
    lastName: z.string().max(100).optional().nullable(),
    companyName: z.string().max(200).optional().nullable(),
    phone: z.string().min(7).max(20),
    email: z.string().email().optional().nullable(),
    nationalId: z.string().max(80).optional().nullable(),
    registrationNumber: z.string().max(120).optional().nullable(),
    kraPin: z.string().max(40).optional().nullable(),
    address: z.string().max(500).optional().nullable(),
    county: z.string().max(120).optional().nullable(),
    nextOfKinName: z.string().max(200).optional().nullable(),
    nextOfKinPhone: z.string().max(40).optional().nullable(),
  }),
  dependents: z.array(z.object({
    fullName: z.string().min(1).max(200),
    relationship: z.string().min(1).max(80),
    dateOfBirth: z.string().optional().nullable(),
    gender: z.string().max(40).optional().nullable(),
    nationalId: z.string().max(80).optional().nullable(),
    birthCertificate: z.string().max(120).optional().nullable(),
  })).optional(),
  policy: z.object({
    createPolicy: z.boolean().optional(),
    acceptedProposalId: z.string().uuid().optional().nullable(),
    insurerId: z.string().uuid().optional().nullable(),
    productId: z.string().uuid().optional().nullable(),
    coverType: z.string().max(120).optional().nullable(),
    premiumAmount: z.number().nonnegative().optional().nullable(),
    startDate: z.string().optional().nullable(),
    endDate: z.string().optional().nullable(),
    notes: z.string().max(2000).optional().nullable(),
  }).optional(),
  documents: z.array(z.object({
    type: z.string().min(1).max(120),
    name: z.string().min(1).max(200),
    fileUrl: z.string().min(1),
    mimeType: z.string().max(120).optional().nullable(),
    fileSize: z.number().int().nonnegative().optional(),
  })).optional(),
});

export const createAgentTaskSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(5000).optional().nullable(),
  dueDate: z.string().datetime().optional().nullable(),
  priority: z.enum(['LOW', 'MEDIUM', 'NORMAL', 'HIGH', 'URGENT']).optional(),
  relatedEntityType: z.enum(['LEAD', 'CLIENT', 'POLICY', 'GENERAL']).optional(),
  relatedEntityId: z.string().uuid().optional().nullable(),
  assignedToUserId: z.string().uuid().optional().nullable(),
  assignedAgentId: z.string().uuid().optional().nullable(),
  createdByUserId: z.string().uuid().optional().nullable(),
  leadId: z.string().uuid().optional().nullable(),
  clientId: z.string().uuid().optional().nullable(),
  policyId: z.string().uuid().optional().nullable(),
});

export const updateAgentTaskSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(5000).optional().nullable(),
  dueDate: z.string().datetime().optional().nullable(),
  priority: z.enum(['LOW', 'MEDIUM', 'NORMAL', 'HIGH', 'URGENT']).optional(),
  status: z.enum(['TODO', 'PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'OVERDUE']).optional(),
});

export type UpdateAgentProfileInput = z.infer<typeof updateAgentProfileSchema>;
export type CreateAgentLeadInput = z.infer<typeof createAgentLeadSchema>;
export type UpdateAgentLeadInput = z.infer<typeof updateAgentLeadSchema>;
export type CreateLeadCommunicationInput = z.infer<typeof createLeadCommunicationSchema>;
export type CreateLeadProposalInput = z.infer<typeof createLeadProposalSchema>;
export type UpdateLeadProposalInput = z.infer<typeof updateLeadProposalSchema>;
export type RejectLeadProposalInput = z.infer<typeof rejectLeadProposalSchema>;
export type ConvertAgentLeadInput = z.infer<typeof convertAgentLeadSchema>;
export type CreateAgentTaskInput = z.infer<typeof createAgentTaskSchema>;
export type UpdateAgentTaskInput = z.infer<typeof updateAgentTaskSchema>;
