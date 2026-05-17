import {
  AgentCommissionCalcType,
  AgentCommissionSourceType,
  AgentCommissionStatus,
  Prisma,
} from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/client';
import { prisma } from '../../config/database';
import {
  CreateAgentCommissionRuleInput,
  ManualAgentCommissionInput,
  MarkCommissionPaidInput,
  UpdateAgentCommissionRuleInput,
} from './agentCommission.validation';

export interface CommissionCalculationInput {
  agentId: string;
  policyId: string;
  clientId?: string | null;
  leadId?: string | null;
  premiumAmount: number;
  productId?: string | null;
  insurerId?: string | null;
  sourceType: AgentCommissionSourceType;
  sourceId?: string | null;
  createdByUserId?: string;
  manualAmount?: number;
}

export async function findApplicableAgentCommissionRule(input: {
  agentId: string;
  productId?: string | null;
  insurerId?: string | null;
  premiumAmount: number;
  at?: Date;
}) {
  const at = input.at ?? new Date();
  const premium = new Decimal(input.premiumAmount);

  const baseWhere: Prisma.AgentCommissionRuleWhereInput = {
    status: 'ACTIVE',
    effectiveFrom: { lte: at },
    OR: [{ effectiveTo: null }, { effectiveTo: { gte: at } }],
    AND: [
      {
        OR: [
          { minPremium: null },
          { minPremium: { lte: premium } },
        ],
      },
      {
        OR: [
          { maxPremium: null },
          { maxPremium: { gte: premium } },
        ],
      },
    ],
  };

  const candidates = await prisma.agentCommissionRule.findMany({
    where: baseWhere,
    orderBy: { effectiveFrom: 'desc' },
  });

  const scoreRule = (rule: (typeof candidates)[0]): number => {
    if (rule.agentId === input.agentId) return 100;
    if (rule.productId && rule.productId === input.productId) return 80;
    if (rule.insurerId && rule.insurerId === input.insurerId) return 60;
    if (rule.appliesTo === 'ALL_AGENTS' && !rule.agentId && !rule.productId && !rule.insurerId) return 10;
    return -1;
  };

  const ranked = candidates
    .map((rule) => ({ rule, score: scoreRule(rule) }))
    .filter((item) => item.score >= 0)
    .sort((a, b) => b.score - a.score);

  return ranked[0]?.rule ?? null;
}

export function calculateCommissionAmount(
  rule: {
    calculationType: AgentCommissionCalcType;
    fixedAmount: Decimal | null;
    percentageRate: Decimal | null;
  } | null,
  premiumAmount: number,
  manualAmount?: number,
): { amount: number; rate: number | null; calculationType: AgentCommissionCalcType } {
  if (manualAmount != null) {
    return { amount: manualAmount, rate: null, calculationType: 'MANUAL_AMOUNT' };
  }
  if (!rule) {
    throw new Error('No applicable agent commission rule found');
  }
  if (rule.calculationType === 'FIXED_AMOUNT') {
    return {
      amount: Number(rule.fixedAmount ?? 0),
      rate: null,
      calculationType: 'FIXED_AMOUNT',
    };
  }
  if (rule.calculationType === 'PERCENTAGE_OF_PREMIUM') {
    const rate = Number(rule.percentageRate ?? 0);
    return {
      amount: premiumAmount * rate,
      rate,
      calculationType: 'PERCENTAGE_OF_PREMIUM',
    };
  }
  if (rule.calculationType === 'MANUAL_AMOUNT') {
    throw new Error('Manual commission amount required for this rule');
  }
  throw new Error(`Unsupported calculation type: ${rule.calculationType}`);
}

export async function createAgentCommissionRecord(input: CommissionCalculationInput) {
  const existing = await prisma.agentCommission.findFirst({
    where: {
      policyId: input.policyId,
      sourceType: input.sourceType,
      sourceId: input.sourceId ?? null,
    },
  });
  if (existing) return existing;

  const policy = await prisma.policy.findUnique({
    where: { id: input.policyId },
    select: {
      id: true,
      clientId: true,
      agentId: true,
      productId: true,
      insurerId: true,
      sourceLeadId: true,
      totalPremium: true,
    },
  });
  if (!policy?.agentId) throw new Error('Policy has no assigned agent');

  const agentId = input.agentId || policy.agentId;
  const premiumAmount = input.premiumAmount || Number(policy.totalPremium);
  const rule = await findApplicableAgentCommissionRule({
    agentId,
    productId: input.productId ?? policy.productId,
    insurerId: input.insurerId ?? policy.insurerId,
    premiumAmount,
  });

  const { amount, rate, calculationType } = calculateCommissionAmount(rule, premiumAmount, input.manualAmount);

  return prisma.agentCommission.create({
    data: {
      agentId,
      clientId: input.clientId ?? policy.clientId,
      policyId: input.policyId,
      leadId: input.leadId ?? policy.sourceLeadId,
      premiumAmount: new Decimal(premiumAmount),
      commissionRuleId: rule?.id ?? null,
      calculationType,
      commissionRate: rate != null ? new Decimal(rate) : null,
      commissionAmount: new Decimal(amount),
      status: 'PENDING',
      sourceType: input.sourceType,
      sourceId: input.sourceId ?? null,
      earnedAt: new Date(),
      createdByUserId: input.createdByUserId ?? null,
    },
  });
}

export async function listAgentCommissionRules(query: Record<string, unknown>) {
  const page = Math.max(1, parseInt(String(query.page ?? 1), 10) || 1);
  const limit = Math.min(100, parseInt(String(query.limit ?? 20), 10) || 20);
  const status = query.status ? String(query.status) : undefined;

  const where: Prisma.AgentCommissionRuleWhereInput = {
    ...(status && { status: status as 'ACTIVE' | 'INACTIVE' }),
  };

  const [rules, total] = await Promise.all([
    prisma.agentCommissionRule.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { effectiveFrom: 'desc' },
      include: {
        agent: { select: { id: true, agentNumber: true, firstName: true, lastName: true } },
        product: { select: { id: true, name: true } },
        insurer: { select: { id: true, name: true, shortName: true } },
      },
    }),
    prisma.agentCommissionRule.count({ where }),
  ]);

  return { rules, total, page, limit };
}

export async function createAgentCommissionRule(data: CreateAgentCommissionRuleInput, userId: string) {
  return prisma.agentCommissionRule.create({
    data: {
      name: data.name,
      description: data.description ?? null,
      agentId: data.agentId ?? null,
      productId: data.productId ?? null,
      insurerId: data.insurerId ?? null,
      appliesTo: data.appliesTo ?? (data.agentId ? 'SPECIFIC_AGENT' : data.productId ? 'PRODUCT' : data.insurerId ? 'INSURER' : 'ALL_AGENTS'),
      calculationType: data.calculationType,
      fixedAmount: data.fixedAmount != null ? new Decimal(data.fixedAmount) : null,
      percentageRate: data.percentageRate != null ? new Decimal(data.percentageRate) : null,
      minPremium: data.minPremium != null ? new Decimal(data.minPremium) : null,
      maxPremium: data.maxPremium != null ? new Decimal(data.maxPremium) : null,
      status: data.status ?? 'ACTIVE',
      effectiveFrom: new Date(data.effectiveFrom),
      effectiveTo: data.effectiveTo ? new Date(data.effectiveTo) : null,
      createdByUserId: userId,
    },
  });
}

export async function updateAgentCommissionRule(id: string, data: UpdateAgentCommissionRuleInput) {
  const rule = await prisma.agentCommissionRule.findUnique({ where: { id } });
  if (!rule) throw new Error('Commission rule not found');
  return prisma.agentCommissionRule.update({
    where: { id },
    data: {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.description !== undefined && { description: data.description }),
      ...(data.agentId !== undefined && { agentId: data.agentId }),
      ...(data.productId !== undefined && { productId: data.productId }),
      ...(data.insurerId !== undefined && { insurerId: data.insurerId }),
      ...(data.appliesTo !== undefined && { appliesTo: data.appliesTo }),
      ...(data.calculationType !== undefined && { calculationType: data.calculationType }),
      ...(data.fixedAmount !== undefined && { fixedAmount: data.fixedAmount != null ? new Decimal(data.fixedAmount) : null }),
      ...(data.percentageRate !== undefined && { percentageRate: data.percentageRate != null ? new Decimal(data.percentageRate) : null }),
      ...(data.minPremium !== undefined && { minPremium: data.minPremium != null ? new Decimal(data.minPremium) : null }),
      ...(data.maxPremium !== undefined && { maxPremium: data.maxPremium != null ? new Decimal(data.maxPremium) : null }),
      ...(data.status !== undefined && { status: data.status }),
      ...(data.effectiveFrom !== undefined && { effectiveFrom: new Date(data.effectiveFrom) }),
      ...(data.effectiveTo !== undefined && { effectiveTo: data.effectiveTo ? new Date(data.effectiveTo) : null }),
    },
  });
}

export async function listAllAgentCommissions(query: Record<string, unknown>) {
  const page = Math.max(1, parseInt(String(query.page ?? 1), 10) || 1);
  const limit = Math.min(100, parseInt(String(query.limit ?? 20), 10) || 20);
  const status = query.status as AgentCommissionStatus | undefined;
  const agentId = query.agentId ? String(query.agentId) : undefined;

  const where: Prisma.AgentCommissionWhereInput = {
    ...(status && { status }),
    ...(agentId && { agentId }),
  };

  const [commissions, total] = await Promise.all([
    prisma.agentCommission.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { earnedAt: 'desc' },
      include: {
        agent: { select: { id: true, agentNumber: true, firstName: true, lastName: true } },
        policy: { select: { id: true, policyNumber: true } },
        client: { select: { id: true, clientNumber: true, firstName: true, lastName: true, companyName: true } },
      },
    }),
    prisma.agentCommission.count({ where }),
  ]);

  return { commissions, total, page, limit };
}

export async function approveAgentCommission(id: string, userId: string) {
  const commission = await prisma.agentCommission.findUnique({ where: { id } });
  if (!commission) throw new Error('Commission not found');
  if (commission.status !== 'PENDING') throw new Error('Only pending commissions can be approved');
  return prisma.agentCommission.update({
    where: { id },
    data: { status: 'APPROVED', approvedAt: new Date(), approvedByUserId: userId },
  });
}

export async function markAgentCommissionPayable(id: string, userId: string) {
  const commission = await prisma.agentCommission.findUnique({ where: { id } });
  if (!commission) throw new Error('Commission not found');
  if (commission.status !== 'APPROVED') throw new Error('Only approved commissions can be marked payable');
  return prisma.agentCommission.update({
    where: { id },
    data: { status: 'PAYABLE', approvedByUserId: userId },
  });
}

export async function markAgentCommissionPaid(id: string, userId: string, data: MarkCommissionPaidInput) {
  const commission = await prisma.agentCommission.findUnique({ where: { id } });
  if (!commission) throw new Error('Commission not found');
  if (!['APPROVED', 'PAYABLE'].includes(commission.status)) {
    throw new Error('Commission must be approved or payable before payment');
  }
  return prisma.agentCommission.update({
    where: { id },
    data: {
      status: 'PAID',
      paidAt: new Date(),
      paidByUserId: userId,
      paymentReference: data.paymentReference,
      paymentMethod: data.paymentMethod ?? null,
      notes: data.notes ?? commission.notes,
    },
  });
}

export async function reverseAgentCommission(id: string, userId: string, notes?: string) {
  const commission = await prisma.agentCommission.findUnique({ where: { id } });
  if (!commission) throw new Error('Commission not found');
  if (!['APPROVED', 'PAYABLE', 'PAID'].includes(commission.status)) {
    throw new Error('Commission cannot be reversed in current status');
  }
  return prisma.agentCommission.update({
    where: { id },
    data: {
      status: 'REVERSED',
      notes: notes ?? commission.notes,
      approvedByUserId: userId,
    },
  });
}

export async function createManualAgentCommission(data: ManualAgentCommissionInput, userId: string) {
  return createAgentCommissionRecord({
    agentId: data.agentId,
    policyId: data.policyId,
    premiumAmount: data.premiumAmount,
    sourceType: data.sourceType ?? 'MANUAL_ADJUSTMENT',
    sourceId: data.sourceId ?? `manual-${Date.now()}`,
    createdByUserId: userId,
    manualAmount: data.commissionAmount,
  });
}

export async function assignLeadAgent(leadId: string, agentId: string | null, userId: string) {
  const lead = await prisma.lead.findFirst({ where: { id: leadId, deletedAt: null } });
  if (!lead) throw new Error('Lead not found');
  return prisma.lead.update({
    where: { id: leadId },
    data: {
      agentId,
      assignedByUserId: userId,
      assignedAt: agentId ? new Date() : null,
    },
  });
}

export async function assignClientAgent(clientId: string, agentId: string | null, userId: string) {
  const client = await prisma.client.findFirst({ where: { id: clientId, deletedAt: null } });
  if (!client) throw new Error('Client not found');
  return prisma.client.update({
    where: { id: clientId },
    data: { agentId },
  });
}

export async function assignPolicyAgent(policyId: string, agentId: string | null, userId: string) {
  const policy = await prisma.policy.findFirst({ where: { id: policyId, deletedAt: null } });
  if (!policy) throw new Error('Policy not found');
  return prisma.policy.update({
    where: { id: policyId },
    data: { agentId, onboardedByUserId: agentId ? userId : policy.onboardedByUserId },
  });
}
