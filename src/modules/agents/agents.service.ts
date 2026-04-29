import { Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { prisma } from '../../config/database';
import { AuthRequest } from '../../types/express';
import { CreateAgentInput, UpdateAgentInput } from './agents.validation';

async function nextAgentNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const startsWith = `AGT-${year}-`;
  const count = await prisma.agent.count({ where: { agentNumber: { startsWith } } });
  return `${startsWith}${String(count + 1).padStart(5, '0')}`;
}

function decimalOrNull(value?: number | null): Decimal | null {
  return value == null ? null : new Decimal(value);
}

export async function listAgents(req: AuthRequest) {
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(100, parseInt(req.query.limit as string) || 20);
  const skip = (page - 1) * limit;
  const search = (req.query.search as string) || '';
  const status = req.query.status as string | undefined;
  const type = req.query.type as string | undefined;

  const where: Prisma.AgentWhereInput = {
    deletedAt: null,
    ...(status && { status: status as any }),
    ...(type && { type: type as any }),
    ...(search && {
      OR: [
        { agentNumber: { contains: search, mode: 'insensitive' } },
        { agentCode: { contains: search, mode: 'insensitive' } },
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { companyName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } },
      ],
    }),
  };

  const [agents, total] = await Promise.all([
    prisma.agent.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { policies: true, commissionEntries: true } } },
    }),
    prisma.agent.count({ where }),
  ]);

  return { agents, total, page, limit };
}

export async function getAgentById(id: string) {
  const agent = await prisma.agent.findFirst({
    where: { id, deletedAt: null },
    include: {
      policies: {
        where: { deletedAt: null },
        orderBy: { createdAt: 'desc' },
        take: 20,
        include: {
          client: { select: { id: true, firstName: true, lastName: true, companyName: true, tradingName: true } },
          insurer: { select: { id: true, name: true, shortName: true } },
          product: { select: { id: true, name: true, code: true } },
        },
      },
      commissionEntries: { orderBy: { earnedDate: 'desc' }, take: 50, include: { policy: true, insurer: true } },
    },
  });
  if (!agent) throw new Error('Agent not found');
  return agent;
}

export async function createAgent(data: CreateAgentInput, userId: string) {
  return prisma.agent.create({
    data: {
      agentNumber: await nextAgentNumber(),
      agentCode: data.agentCode ?? null,
      type: data.agentType as any,
      status: data.status as any,
      userId: data.userId ?? null,
      firstName: data.firstName ?? null,
      lastName: data.lastName ?? null,
      companyName: data.companyName ?? null,
      email: data.email,
      phone: data.phone,
      kraPin: data.kraPin ?? null,
      nationalId: data.nationalId ?? null,
      bankName: data.bankName ?? null,
      bankBranch: data.bankBranch ?? null,
      bankAccountName: data.bankAccountName ?? null,
      bankAccountNumber: data.bankAccountNumber ?? null,
      mpesaNumber: data.mpesaNumber ?? null,
      defaultCommissionRate: decimalOrNull(data.defaultCommissionRate),
      withholdingTaxRate: decimalOrNull(data.withholdingTaxRate),
      notes: data.notes ?? null,
      recruitmentDate: new Date(),
    },
  });
}

export async function updateAgent(id: string, data: UpdateAgentInput) {
  const agent = await prisma.agent.findFirst({ where: { id, deletedAt: null } });
  if (!agent) throw new Error('Agent not found');
  return prisma.agent.update({
    where: { id },
    data: {
      ...(data.agentCode !== undefined && { agentCode: data.agentCode }),
      ...(data.userId !== undefined && { userId: data.userId }),
      ...(data.firstName !== undefined && { firstName: data.firstName }),
      ...(data.lastName !== undefined && { lastName: data.lastName }),
      ...(data.companyName !== undefined && { companyName: data.companyName }),
      ...(data.email !== undefined && { email: data.email }),
      ...(data.phone !== undefined && { phone: data.phone }),
      ...(data.agentType !== undefined && { type: data.agentType as any }),
      ...(data.status !== undefined && { status: data.status as any }),
      ...(data.kraPin !== undefined && { kraPin: data.kraPin }),
      ...(data.nationalId !== undefined && { nationalId: data.nationalId }),
      ...(data.bankName !== undefined && { bankName: data.bankName }),
      ...(data.bankBranch !== undefined && { bankBranch: data.bankBranch }),
      ...(data.bankAccountName !== undefined && { bankAccountName: data.bankAccountName }),
      ...(data.bankAccountNumber !== undefined && { bankAccountNumber: data.bankAccountNumber }),
      ...(data.mpesaNumber !== undefined && { mpesaNumber: data.mpesaNumber }),
      ...(data.defaultCommissionRate !== undefined && { defaultCommissionRate: decimalOrNull(data.defaultCommissionRate) }),
      ...(data.withholdingTaxRate !== undefined && { withholdingTaxRate: decimalOrNull(data.withholdingTaxRate) }),
      ...(data.notes !== undefined && { notes: data.notes }),
    },
  });
}

export async function deactivateAgent(id: string, userId: string) {
  const agent = await prisma.agent.findFirst({ where: { id, deletedAt: null } });
  if (!agent) throw new Error('Agent not found');
  return prisma.agent.update({
    where: { id },
    data: { status: 'INACTIVE', terminationDate: new Date(), terminationReason: 'Deactivated by administrator', notes: agent.notes, deletedAt: null },
  });
}

export async function getAgentMetrics(id: string) {
  const [policyStats, commissionStats, clawbacks] = await Promise.all([
    prisma.policy.aggregate({
      where: { agentId: id, deletedAt: null },
      _count: true,
      _sum: { totalPremium: true },
    }),
    prisma.commissionEntry.groupBy({
      by: ['status'],
      where: { agentId: id },
      _sum: { grossCommission: true, netCommission: true },
      _count: true,
    }),
    prisma.commissionEntry.aggregate({
      where: { agentId: id, status: 'CLAWED_BACK' },
      _sum: { netCommission: true },
      _count: true,
    }),
  ]);

  const paid = commissionStats.find((item) => item.status === 'PAID')?._sum.netCommission ?? new Decimal(0);
  const earned = commissionStats.reduce((sum, item) => sum.plus(item._sum.grossCommission ?? 0), new Decimal(0));
  const pending = commissionStats
    .filter((item) => ['CALCULATED', 'PENDING_APPROVAL', 'APPROVED', 'PAYABLE', 'HELD'].includes(item.status))
    .reduce((sum, item) => sum.plus(item._sum.netCommission ?? 0), new Decimal(0));

  return {
    policiesSold: policyStats._count,
    grossPremiumGenerated: policyStats._sum.totalPremium ?? 0,
    commissionEarned: earned,
    commissionPaid: paid,
    commissionPending: pending,
    clawbacks: clawbacks._sum.netCommission ?? 0,
    conversionRate: null,
  };
}

export async function getAgentStatement(id: string, dateFrom?: Date, dateTo?: Date) {
  const agent = await getAgentById(id);
  const entries = await prisma.commissionEntry.findMany({
    where: {
      agentId: id,
      ...(dateFrom || dateTo ? { earnedDate: { ...(dateFrom && { gte: dateFrom }), ...(dateTo && { lte: dateTo }) } } : {}),
    },
    include: { policy: true, insurer: true, product: true },
    orderBy: { earnedDate: 'asc' },
  });

  return {
    agent,
    generatedAt: new Date(),
    entries,
    totals: entries.reduce((totals, entry) => ({
      grossCommission: totals.grossCommission.plus(entry.grossCommission),
      withholdingTax: totals.withholdingTax.plus(entry.withholdingTax),
      netCommission: totals.netCommission.plus(entry.netCommission),
    }), { grossCommission: new Decimal(0), withholdingTax: new Decimal(0), netCommission: new Decimal(0) }),
  };
}

