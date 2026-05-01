import { z } from 'zod';

const channel = z.enum(['EMAIL', 'SMS', 'WHATSAPP', 'INTERNAL_NOTIFICATION']);
const category = z.enum([
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
  'COMMISSION_NOTIFICATION',
  'ACCOUNTING_NOTIFICATION',
  'HOLIDAY_GREETING',
  'BIRTHDAY_GREETING',
  'CUSTOM',
  'TRANSACTIONAL',
  'REMINDER',
  'MARKETING',
  'SYSTEM',
]);

const entityLinkSchema = z.object({
  relatedEntityType: z.string().optional(),
  relatedEntityId: z.string().optional(),
  clientId: z.string().uuid().optional(),
  policyId: z.string().uuid().optional(),
  claimId: z.string().uuid().optional(),
  taskId: z.string().uuid().optional(),
  onboardingCaseId: z.string().uuid().optional(),
  paymentId: z.string().uuid().optional(),
  userId: z.string().uuid().optional(),
});

const recipientSchema = z.object({
  recipientType: z.enum(['CLIENT', 'USER', 'CUSTOM', 'CONTACT_PERSON', 'AGENT']),
  recipientName: z.string().optional(),
  email: z.string().email().optional(),
  phone: z.string().min(6).optional(),
  clientId: z.string().uuid().optional(),
  userId: z.string().uuid().optional(),
  agentId: z.string().uuid().optional(),
  contactPersonId: z.string().uuid().optional(),
});

export const listQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().optional(),
  channel: channel.optional(),
  status: z.string().optional(),
  category: category.optional(),
  entityType: z.string().optional(),
  entityId: z.string().optional(),
});

export const templateSchema = z.object({
  name: z.string().min(2),
  code: z.string().min(2).regex(/^[A-Z0-9_:-]+$/),
  channel,
  category,
  subject: z.string().optional().nullable(),
  body: z.string().min(1),
  variables: z.record(z.any()).optional(),
  isSystem: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

export const updateTemplateSchema = templateSchema.partial();

export const previewTemplateSchema = z.object({
  variables: z.record(z.any()).optional(),
  entity: entityLinkSchema.optional(),
});

export const sendMessageSchema = z.object({
  channel,
  messageType: z.string().default('MANUAL'),
  category: category.default('GENERAL'),
  subject: z.string().optional(),
  body: z.string().min(1),
  templateId: z.string().uuid().optional(),
  variables: z.record(z.any()).optional(),
  recipients: z.array(recipientSchema).min(1),
  priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']).default('NORMAL'),
  scheduledAt: z.coerce.date().optional(),
  sendNow: z.boolean().default(true),
}).merge(entityLinkSchema);

export const bulkMessageSchema = z.object({
  name: z.string().min(3),
  description: z.string().min(8),
  channel,
  category: category.default('GENERAL'),
  audienceType: z.enum(['CLIENTS', 'USERS', 'AGENTS', 'CUSTOM', 'MIXED']).default('CLIENTS'),
  subject: z.string().optional(),
  body: z.string().min(1),
  templateId: z.string().uuid().optional(),
  filters: z.record(z.any()).optional(),
  customRecipients: z.array(recipientSchema).optional(),
  scheduledAt: z.coerce.date().optional(),
  confirmBulkSend: z.literal(true),
});

export const campaignSchema = bulkMessageSchema.omit({ confirmBulkSend: true }).extend({
  status: z.enum(['DRAFT', 'SCHEDULED']).optional(),
});

export const campaignUpdateSchema = campaignSchema.partial();

export const audiencePreviewSchema = z.object({
  audienceType: z.enum(['CLIENTS', 'USERS', 'AGENTS', 'CUSTOM', 'MIXED']).default('CLIENTS'),
  channel: channel.optional(),
  filters: z.record(z.any()).optional(),
  customRecipients: z.array(recipientSchema).optional(),
});

export const recipientSearchSchema = z.object({
  q: z.string().default(''),
  type: z.enum(['clients', 'users', 'agents', 'all']).default('all'),
  limit: z.coerce.number().int().positive().max(50).default(20),
});

export const automationUpdateSchema = z.object({
  name: z.string().min(2).optional(),
  channel: channel.optional(),
  templateId: z.string().uuid().nullable().optional(),
  isActive: z.boolean().optional(),
  conditions: z.record(z.any()).optional(),
  scheduleConfig: z.record(z.any()).optional(),
  recipientConfig: z.record(z.any()).optional(),
});

export const preferenceUpdateSchema = z.object({
  preferences: z.array(z.object({
    channel,
    category,
    isOptedIn: z.boolean(),
    reason: z.string().optional(),
  })).min(1),
});
