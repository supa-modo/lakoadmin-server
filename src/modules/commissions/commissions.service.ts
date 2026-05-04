import { prisma } from '../../config/database';
import {
  CalculateCommissionInput,
  CommissionClawbackInput,
  CommissionPayInput,
  CreateCommissionRuleInput,
  RecordInsurerCommissionPaymentInput,
  UpdateCommissionRuleInput,
} from './commissions.validation';
import { AuthRequest } from '../../types/express';
import { Decimal } from '@prisma/client/runtime/client';
import { postJournal, SYSTEM_ACCOUNTS } from '../accounting/postingEngine.service';

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

export async function listCommissionEntries(req: AuthRequest) {
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(100, parseInt(req.query.limit as string) || 20);
  const skip = (page - 1) * limit;
  const status = req.query.status as string | undefined;
  const agentId = req.query.agentId as string | undefined;
  const insurerId = req.query.insurerId as string | undefined;
  const policyId = req.query.policyId as string | undefined;

  const where: any = {
    ...(status && { status }),
    ...(agentId && { agentId }),
    ...(insurerId && { insurerId }),
    ...(policyId && { policyId }),
  };

  const [entries, total] = await Promise.all([
    prisma.commissionEntry.findMany({
      where,
      skip,
      take: limit,
      orderBy: { earnedDate: 'desc' },
      include: {
        agent: true,
        policy: { select: { id: true, policyNumber: true, premiumCollectionMode: true } },
        insurer: { select: { id: true, name: true, shortName: true } },
        product: { select: { id: true, name: true, code: true } },
      },
    }),
    prisma.commissionEntry.count({ where }),
  ]);

  return { entries, total, page, limit };
}

export async function getCommissionEntryById(id: string) {
  const entry = await prisma.commissionEntry.findUnique({
    where: { id },
    include: { agent: true, policy: true, insurer: true, product: true, journalEntries: true },
  });
  if (!entry) throw new Error('Commission entry not found');
  return entry;
}

export async function approveCommissionEntry(id: string, userId: string, notes?: string | null) {
  return prisma.$transaction(async (tx) => {
    const entry = await tx.commissionEntry.findUnique({ where: { id }, include: { policy: true } });
    if (!entry) throw new Error('Commission entry not found');
    if (!entry.agentId) throw new Error('Agency commission entries cannot be approved as agent commission payables');
    if (!['CALCULATED', 'PENDING_APPROVAL', 'HELD'].includes(entry.status)) throw new Error(`Cannot approve commission from ${entry.status}`);

    const updated = await tx.commissionEntry.update({
      where: { id },
      data: { status: 'APPROVED', approvedById: userId, approvedAt: new Date(), notes: notes ?? entry.notes },
    });

    await postJournal(tx, {
      event: 'AGENT_COMMISSION_APPROVED',
      description: `Agent commission approved for policy ${entry.policy.policyNumber}`,
      reference: entry.policy.policyNumber,
      sourceKey: `agent-commission-approved:${id}`,
      source: { commissionEntryId: id, policyId: entry.policyId, agentId: entry.agentId, insurerId: entry.insurerId ?? undefined },
      userId,
      lines: [
        { accountCode: SYSTEM_ACCOUNTS.AGENT_COMMISSION_EXPENSE, debit: entry.grossCommission, description: 'Agent commission expense' },
        { accountCode: SYSTEM_ACCOUNTS.AGENT_COMMISSION_PAYABLE, credit: entry.grossCommission, description: 'Agent commission payable' },
      ],
    });

    return updated;
  });
}

export async function holdCommissionEntry(id: string, reason: string) {
  const entry = await prisma.commissionEntry.findUnique({ where: { id } });
  if (!entry) throw new Error('Commission entry not found');
  if (entry.status === 'PAID') throw new Error('Paid commissions cannot be held');
  return prisma.commissionEntry.update({ where: { id }, data: { status: 'HELD', notes: reason } });
}

export async function payCommissionEntry(id: string, data: CommissionPayInput, userId: string) {
  return prisma.$transaction(async (tx) => {
    const entry = await tx.commissionEntry.findUnique({ where: { id }, include: { policy: true } });
    if (!entry) throw new Error('Commission entry not found');
    if (!entry.agentId) throw new Error('Agency commission entries cannot be paid through the agent commission workflow');
    if (!['APPROVED', 'PAYABLE'].includes(entry.status)) throw new Error('Commission must be approved before payment');

    const bankAmount = entry.netCommission;
    const taxAmount = entry.withholdingTax;
    const lines: Array<{ accountCode: string; debit?: Decimal; credit?: Decimal; description: string }> = [
      { accountCode: SYSTEM_ACCOUNTS.AGENT_COMMISSION_PAYABLE, debit: entry.grossCommission, description: 'Settle agent commission payable' },
      { accountCode: SYSTEM_ACCOUNTS.BANK_OPERATING, credit: bankAmount, description: 'Agent commission paid from operating account' },
    ];
    if (taxAmount.gt(0)) {
      lines.push({ accountCode: SYSTEM_ACCOUNTS.WITHHOLDING_TAX_PAYABLE, credit: taxAmount, description: 'Withholding tax payable' });
    }

    await postJournal(tx, {
      event: 'AGENT_COMMISSION_PAID',
      entryDate: data.paidAt ? new Date(data.paidAt) : new Date(),
      description: `Agent commission paid for policy ${entry.policy.policyNumber}`,
      reference: data.paymentReference,
      sourceKey: `agent-commission-paid:${id}:${data.paymentReference}`,
      source: { commissionEntryId: id, policyId: entry.policyId, agentId: entry.agentId, insurerId: entry.insurerId ?? undefined },
      userId,
      lines,
    });

    return tx.commissionEntry.update({
      where: { id },
      data: {
        status: 'PAID',
        paidAt: data.paidAt ? new Date(data.paidAt) : new Date(),
        paymentMethod: data.paymentMethod as any,
        paymentReference: data.paymentReference,
        notes: data.notes ?? entry.notes,
      },
    });
  });
}

export async function clawbackCommissionEntry(id: string, data: CommissionClawbackInput, userId: string) {
  return prisma.$transaction(async (tx) => {
    const entry = await tx.commissionEntry.findUnique({ where: { id } });
    if (!entry) throw new Error('Commission entry not found');
    const clawbackAmount = data.amount ? new Decimal(data.amount) : entry.grossCommission;
    const clawback = await tx.commissionEntry.create({
      data: {
        agentId: entry.agentId,
        policyId: entry.policyId,
        insurerId: entry.insurerId,
        productId: entry.productId,
        premiumAmount: entry.premiumAmount,
        commissionBasis: entry.commissionBasis,
        commissionRate: entry.commissionRate,
        grossCommission: clawbackAmount.neg(),
        grossCommissionAmount: clawbackAmount.neg(),
        withholdingTax: new Decimal(0),
        withholdingTaxAmount: new Decimal(0),
        netCommission: clawbackAmount.neg(),
        netCommissionAmount: clawbackAmount.neg(),
        commissionType: entry.commissionType,
        commissionSource: 'ADJUSTMENT',
        paymentCollectionMode: entry.paymentCollectionMode,
        settlementMode: entry.settlementMode,
        status: 'CLAWED_BACK',
        earnedDate: new Date(),
        clawbackOfId: entry.id,
        clawbackReason: data.reason,
        notes: `Clawback of ${entry.id}: ${data.reason}`,
      },
    });
    await tx.commissionEntry.update({ where: { id }, data: { status: 'CLAWED_BACK', clawbackReason: data.reason } });
    return clawback;
  });
}

export async function getInsurerCommissionReceivables(req: AuthRequest) {
  const insurerId = req.query.insurerId as string | undefined;
  const entries = await prisma.commissionEntry.findMany({
    where: {
      insurerCommissionStatus: { in: ['RECEIVABLE', 'PARTIALLY_RECEIVED', 'OVERDUE'] },
      ...(insurerId && { insurerId }),
    },
    include: { insurer: true, policy: true, agent: true },
    orderBy: { earnedDate: 'asc' },
  });
  const totalReceivable = entries.reduce((sum, entry) => sum.plus(entry.commissionReceivableAmount.minus(entry.commissionReceivedAmount)), new Decimal(0));
  return { entries, totalReceivable };
}

async function nextInsurerCommissionReceiptNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const startsWith = `ICR-${year}-`;
  const count = await prisma.insurerCommissionReceipt.count({ where: { receiptNumber: { startsWith } } });
  return `${startsWith}${String(count + 1).padStart(6, '0')}`;
}

export async function recordInsurerCommissionPayment(data: RecordInsurerCommissionPaymentInput, userId: string) {
  return prisma.$transaction(async (tx) => {
    const amount = new Decimal(data.amount);
    const receipt = await tx.insurerCommissionReceipt.create({
      data: {
        receiptNumber: await nextInsurerCommissionReceiptNumber(),
        insurerId: data.insurerId,
        commissionEntryId: data.commissionEntryId ?? null,
        amount,
        method: data.method as any,
        reference: data.reference ?? null,
        receivedDate: new Date(data.receivedDate),
        notes: data.notes ?? null,
        createdById: userId,
      },
    });

    if (data.commissionEntryId) {
      const entry = await tx.commissionEntry.findUniqueOrThrow({ where: { id: data.commissionEntryId } });
      const received = entry.commissionReceivedAmount.plus(amount);
      const status = received.gte(entry.commissionReceivableAmount) ? 'RECEIVED' : 'PARTIALLY_RECEIVED';
      await tx.commissionEntry.update({
        where: { id: entry.id },
        data: { commissionReceivedAmount: received, insurerCommissionStatus: status, status, accountingPostedStatus: 'POSTED' },
      });
      await tx.policy.update({
        where: { id: entry.policyId },
        data: { commissionReceivedAmount: { increment: amount }, insurerCommissionStatus: status, accountingPostedStatus: 'POSTED' },
      });
    }

    await postJournal(tx, {
      event: 'INSURER_COMMISSION_RECEIVED',
      entryDate: new Date(data.receivedDate),
      description: 'Insurer commission payment received',
      reference: data.reference ?? receipt.receiptNumber,
      sourceKey: `insurer-commission-received:${receipt.id}`,
      source: { insurerId: data.insurerId, commissionEntryId: data.commissionEntryId ?? undefined },
      userId,
      lines: [
        { accountCode: data.method === 'MPESA' ? SYSTEM_ACCOUNTS.MPESA_OPERATING : SYSTEM_ACCOUNTS.BANK_OPERATING, debit: amount, description: 'Commission cash received' },
        { accountCode: SYSTEM_ACCOUNTS.COMMISSION_RECEIVABLE_INSURERS, credit: amount, description: 'Clear insurer commission receivable' },
      ],
    });

    return receipt;
  });
}
