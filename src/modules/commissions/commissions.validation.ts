import { z } from 'zod';

const CommissionTypeEnum = z.enum(['FIRST_YEAR', 'RENEWAL', 'OVERRIDE', 'BONUS']);
const CalculationBasisEnum = z.enum(['GROSS_PREMIUM', 'NET_PREMIUM', 'SUM_INSURED', 'FLAT_FEE']);
const ClientTypeEnum = z.enum(['INDIVIDUAL', 'CORPORATE', 'SME', 'GROUP', 'GOVERNMENT']);

export const createCommissionRuleSchema = z.object({
  insurerId: z.string().uuid().optional().nullable(),
  productId: z.string().uuid().optional().nullable(),
  agentId: z.string().uuid().optional().nullable(),
  clientType: ClientTypeEnum.optional().nullable(),
  commissionType: CommissionTypeEnum.default('FIRST_YEAR'),
  rate: z.number().min(0).max(1, 'Rate must be between 0 and 1 (e.g. 0.15 for 15%)'),
  calculationBasis: CalculationBasisEnum.default('GROSS_PREMIUM'),
  minPremium: z.number().positive().optional().nullable(),
  maxPremium: z.number().positive().optional().nullable(),
  effectiveFrom: z.string().datetime(),
  effectiveTo: z.string().datetime().optional().nullable(),
  isActive: z.boolean().optional(),
  clawbackPeriodDays: z.number().int().positive().optional().nullable(),
  clawbackPercentage: z.number().min(0).max(1).optional().nullable(),
  notes: z.string().optional(),
}).refine(
  (data) => data.insurerId || data.productId,
  { message: 'Either insurerId or productId must be provided' }
);

export const updateCommissionRuleSchema = z.object({
  rate: z.number().min(0).max(1).optional(),
  commissionType: CommissionTypeEnum.optional(),
  calculationBasis: CalculationBasisEnum.optional(),
  clientType: ClientTypeEnum.optional().nullable(),
  minPremium: z.number().positive().optional().nullable(),
  maxPremium: z.number().positive().optional().nullable(),
  effectiveFrom: z.string().datetime().optional(),
  effectiveTo: z.string().datetime().optional().nullable(),
  isActive: z.boolean().optional(),
  clawbackPeriodDays: z.number().int().positive().optional().nullable(),
  clawbackPercentage: z.number().min(0).max(1).optional().nullable(),
  notes: z.string().optional(),
});

export const calculateCommissionSchema = z.object({
  insurerId: z.string().uuid(),
  productId: z.string().uuid(),
  agentId: z.string().uuid().optional(),
  clientType: ClientTypeEnum.optional(),
  premiumAmount: z.number().positive(),
  sumInsured: z.number().positive().optional(),
  commissionType: CommissionTypeEnum.optional(),
  policyDate: z.string().datetime().optional(),
});

export type CreateCommissionRuleInput = z.infer<typeof createCommissionRuleSchema>;
export type UpdateCommissionRuleInput = z.infer<typeof updateCommissionRuleSchema>;
export type CalculateCommissionInput = z.infer<typeof calculateCommissionSchema>;
