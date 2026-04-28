import { prisma } from '../../config/database';
import { CreateCommissionRuleInput, UpdateCommissionRuleInput, CalculateCommissionInput } from './commissions.validation';
import { AuthRequest } from '../../types/express';
import { Decimal } from '@prisma/client/runtime/library';

function toDecimalOrNull(v: number | null | undefined): Decimal | null {
  if (v == null) return null;
  return new Decimal(v);
}

export async function listCommissionRules(req: AuthRequest) {
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(100, parseInt(req.query.limit as string) || 20);
  const skip = (page - 1) * limit;
  const insurerId = req.query.insurerId as string | undefined;
  const productId = req.query.productId as string | undefined;
  const agentId = req.query.agentId as string | undefined;
  const commissionType = req.query.commissionType as string | undefined;
  const isActive = req.query.isActive !== undefined ? req.query.isActive === 'true' : undefined;

  const where: any = {
    ...(insurerId && { insurerId }),
    ...(productId && { productId }),
    ...(agentId && { agentId }),
    ...(commissionType && { commissionType }),
    ...(isActive !== undefined && { isActive }),
  };

  const [rules, total] = await Promise.all([
    prisma.commissionRule.findMany({
      where,
      skip,
      take: limit,
      orderBy: { effectiveFrom: 'desc' },
      include: {
        insurer: { select: { id: true, name: true, shortName: true } },
        product: { select: { id: true, name: true, code: true, insuranceClass: true } },
        agent: { select: { id: true, agentNumber: true, firstName: true, lastName: true } },
      },
    }),
    prisma.commissionRule.count({ where }),
  ]);

  return { rules, total, page, limit };
}

export async function getCommissionRuleById(id: string) {
  const rule = await prisma.commissionRule.findUnique({
    where: { id },
    include: {
      insurer: { select: { id: true, name: true, shortName: true } },
      product: { select: { id: true, name: true, code: true, insuranceClass: true } },
      agent: { select: { id: true, agentNumber: true, firstName: true, lastName: true } },
    },
  });
  if (!rule) throw new Error('Commission rule not found');
  return rule;
}

export async function createCommissionRule(data: CreateCommissionRuleInput) {
  return prisma.commissionRule.create({
    data: {
      insurerId: data.insurerId || null,
      productId: data.productId || null,
      agentId: data.agentId || null,
      clientType: data.clientType || null,
      commissionType: data.commissionType,
      rate: new Decimal(data.rate),
      calculationBasis: data.calculationBasis,
      minPremium: toDecimalOrNull(data.minPremium),
      maxPremium: toDecimalOrNull(data.maxPremium),
      effectiveFrom: new Date(data.effectiveFrom),
      effectiveTo: data.effectiveTo ? new Date(data.effectiveTo) : null,
      isActive: data.isActive ?? true,
      clawbackPeriodDays: data.clawbackPeriodDays || null,
      clawbackPercentage: toDecimalOrNull(data.clawbackPercentage),
      notes: data.notes,
    },
    include: {
      insurer: { select: { id: true, name: true } },
      product: { select: { id: true, name: true, code: true } },
    },
  });
}

export async function updateCommissionRule(id: string, data: UpdateCommissionRuleInput) {
  const rule = await prisma.commissionRule.findUnique({ where: { id } });
  if (!rule) throw new Error('Commission rule not found');

  return prisma.commissionRule.update({
    where: { id },
    data: {
      ...(data.rate !== undefined && { rate: new Decimal(data.rate) }),
      ...(data.commissionType !== undefined && { commissionType: data.commissionType }),
      ...(data.calculationBasis !== undefined && { calculationBasis: data.calculationBasis }),
      ...(data.clientType !== undefined && { clientType: data.clientType || null }),
      ...(data.minPremium !== undefined && { minPremium: toDecimalOrNull(data.minPremium) }),
      ...(data.maxPremium !== undefined && { maxPremium: toDecimalOrNull(data.maxPremium) }),
      ...(data.effectiveFrom !== undefined && { effectiveFrom: new Date(data.effectiveFrom) }),
      ...(data.effectiveTo !== undefined && { effectiveTo: data.effectiveTo ? new Date(data.effectiveTo) : null }),
      ...(data.isActive !== undefined && { isActive: data.isActive }),
      ...(data.clawbackPeriodDays !== undefined && { clawbackPeriodDays: data.clawbackPeriodDays || null }),
      ...(data.clawbackPercentage !== undefined && { clawbackPercentage: toDecimalOrNull(data.clawbackPercentage) }),
      ...(data.notes !== undefined && { notes: data.notes }),
    },
    include: {
      insurer: { select: { id: true, name: true } },
      product: { select: { id: true, name: true, code: true } },
    },
  });
}

export async function deactivateCommissionRule(id: string) {
  const rule = await prisma.commissionRule.findUnique({ where: { id } });
  if (!rule) throw new Error('Commission rule not found');
  return prisma.commissionRule.update({
    where: { id },
    data: { isActive: false },
  });
}

export async function calculateCommission(data: CalculateCommissionInput) {
  const now = data.policyDate ? new Date(data.policyDate) : new Date();
  const commissionType = data.commissionType || 'FIRST_YEAR';

  // Rule resolution: product-specific > insurer-level > default
  const findRule = async (productId?: string, insurerId?: string, agentId?: string) => {
    return prisma.commissionRule.findFirst({
      where: {
        isActive: true,
        commissionType,
        effectiveFrom: { lte: now },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: now } }],
        ...(productId && { productId }),
        ...(insurerId && !productId && { insurerId }),
        ...(agentId && { agentId }),
        ...(data.clientType && { OR: [{ clientType: data.clientType }, { clientType: null }] }),
      },
      orderBy: [{ agentId: 'desc' }, { productId: 'desc' }, { effectiveFrom: 'desc' }],
    });
  };

  // Try product+agent, then product, then insurer+agent, then insurer
  const rule =
    (await findRule(data.productId, undefined, data.agentId)) ||
    (await findRule(data.productId)) ||
    (await findRule(undefined, data.insurerId, data.agentId)) ||
    (await findRule(undefined, data.insurerId));

  if (!rule) {
    return {
      ruleFound: false,
      grossCommission: 0,
      rate: 0,
      calculationBasis: 'GROSS_PREMIUM',
      message: 'No active commission rule found for this product/insurer combination',
    };
  }

  const rate = parseFloat(rule.rate.toString());
  let baseAmount = data.premiumAmount;
  if (rule.calculationBasis === 'SUM_INSURED' && data.sumInsured) {
    baseAmount = data.sumInsured;
  } else if (rule.calculationBasis === 'FLAT_FEE') {
    baseAmount = 1;
  }

  const grossCommission = parseFloat((baseAmount * rate).toFixed(2));

  return {
    ruleFound: true,
    ruleId: rule.id,
    commissionType: rule.commissionType,
    rate,
    ratePercentage: `${(rate * 100).toFixed(2)}%`,
    calculationBasis: rule.calculationBasis,
    baseAmount,
    grossCommission,
    clawbackPeriodDays: rule.clawbackPeriodDays,
    clawbackPercentage: rule.clawbackPercentage ? parseFloat(rule.clawbackPercentage.toString()) : null,
  };
}
