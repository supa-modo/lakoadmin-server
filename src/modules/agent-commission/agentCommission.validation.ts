import { z } from 'zod';

export const createAgentCommissionRuleSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional().nullable(),
  agentId: z.string().uuid().optional().nullable(),
  productId: z.string().uuid().optional().nullable(),
  insurerId: z.string().uuid().optional().nullable(),
  appliesTo: z.enum(['ALL_AGENTS', 'SPECIFIC_AGENT', 'PRODUCT', 'INSURER', 'POLICY_TYPE']).optional(),
  calculationType: z.enum(['FIXED_AMOUNT', 'PERCENTAGE_OF_PREMIUM', 'MANUAL_AMOUNT', 'TIERED']),
  fixedAmount: z.number().nonnegative().optional().nullable(),
  percentageRate: z.number().min(0).max(1).optional().nullable(),
  minPremium: z.number().nonnegative().optional().nullable(),
  maxPremium: z.number().nonnegative().optional().nullable(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
  effectiveFrom: z.string().datetime(),
  effectiveTo: z.string().datetime().optional().nullable(),
});

export const updateAgentCommissionRuleSchema = createAgentCommissionRuleSchema.partial();

export const manualAgentCommissionSchema = z.object({
  agentId: z.string().uuid(),
  policyId: z.string().uuid(),
  premiumAmount: z.number().positive(),
  commissionAmount: z.number().positive(),
  notes: z.string().max(2000).optional().nullable(),
  sourceType: z.enum(['POLICY_ACTIVATION', 'PREMIUM_PAYMENT', 'MANUAL_ADJUSTMENT', 'RENEWAL', 'REVERSAL']).optional(),
  sourceId: z.string().optional().nullable(),
});

export const assignAgentSchema = z.object({
  agentId: z.string().uuid().nullable(),
  notes: z.string().max(500).optional().nullable(),
});

export const markCommissionPaidSchema = z.object({
  paymentReference: z.string().min(1).max(120),
  paymentMethod: z.enum(['MPESA', 'BANK_TRANSFER', 'CHEQUE', 'CASH', 'CARD', 'DIRECT_DEBIT']).optional(),
  notes: z.string().max(2000).optional().nullable(),
});

export type CreateAgentCommissionRuleInput = z.infer<typeof createAgentCommissionRuleSchema>;
export type UpdateAgentCommissionRuleInput = z.infer<typeof updateAgentCommissionRuleSchema>;
export type ManualAgentCommissionInput = z.infer<typeof manualAgentCommissionSchema>;
export type AssignAgentInput = z.infer<typeof assignAgentSchema>;
export type MarkCommissionPaidInput = z.infer<typeof markCommissionPaidSchema>;
