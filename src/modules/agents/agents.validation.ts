import { z } from 'zod';

const agentTypeSchema = z.enum(['INTERNAL', 'EXTERNAL', 'PARTNER', 'REFERRAL', 'EMPLOYEE', 'TIED_AGENT', 'INDEPENDENT_AGENT', 'REFERRER', 'CORPORATE_AGENT']);
const agentStatusSchema = z.enum(['ACTIVE', 'INACTIVE', 'SUSPENDED', 'TERMINATED']);

const agentFormSchema = z.object({
  agentCode: z.string().optional().nullable(),
  userId: z.string().uuid().optional().nullable(),
  firstName: z.string().optional().nullable(),
  lastName: z.string().optional().nullable(),
  companyName: z.string().optional().nullable(),
  email: z.string().email(),
  phone: z.string().min(7),
  agentType: agentTypeSchema.default('EXTERNAL'),
  status: agentStatusSchema.optional().default('ACTIVE'),
  kraPin: z.string().optional().nullable(),
  nationalId: z.string().optional().nullable(),
  bankName: z.string().optional().nullable(),
  bankBranch: z.string().optional().nullable(),
  bankAccountName: z.string().optional().nullable(),
  bankAccountNumber: z.string().optional().nullable(),
  mpesaNumber: z.string().optional().nullable(),
  defaultCommissionRate: z.number().min(0).max(1).optional().nullable(),
  withholdingTaxRate: z.number().min(0).max(1).optional().nullable(),
  notes: z.string().optional().nullable(),
});

export const createAgentSchema = agentFormSchema.refine((value) => value.firstName || value.lastName || value.companyName, {
  message: 'Provide an agent name or company name',
});

export const updateAgentSchema = agentFormSchema.partial();

export type CreateAgentInput = z.infer<typeof createAgentSchema>;
export type UpdateAgentInput = z.infer<typeof updateAgentSchema>;
