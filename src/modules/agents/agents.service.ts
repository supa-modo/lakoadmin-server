import { Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/client';
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
      include: {
        manager: { select: { id: true, agentNumber: true, firstName: true, lastName: true, companyName: true } },
        _count: { select: { policies: true, commissionEntries: true, reportees: true } },
      },
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
      manager: { select: { id: true, agentNumber: true, firstName: true, lastName: true, companyName: true } },
      reportees: { where: { deletedAt: null }, select: { id: true, agentNumber: true, firstName: true, lastName: true, companyName: true, status: true } },
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
      managerId: data.managerId ?? null,
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
  if (data.managerId === id) throw new Error('Agent cannot manage themselves');
  return prisma.agent.update({
    where: { id },
    data: {
      ...(data.agentCode !== undefined && { agentCode: data.agentCode }),
      ...(data.userId !== undefined && { userId: data.userId }),
      ...(data.managerId !== undefined && { managerId: data.managerId }),
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

function money(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function clientDisplayName(client: { firstName?: string | null; lastName?: string | null; companyName?: string | null; tradingName?: string | null; clientNumber?: string | null } | null | undefined): string {
  if (!client) return 'Client';
  return `${client.firstName ?? ''} ${client.lastName ?? ''}`.trim() || client.companyName || client.tradingName || client.clientNumber || 'Client';
}

export async function getMyAgentPortal(userId: string, email: string) {
  const agent = await prisma.agent.findFirst({
    where: {
      deletedAt: null,
      OR: [{ userId }, { email }],
    },
    include: {
      manager: { select: { id: true, agentNumber: true, firstName: true, lastName: true, companyName: true, email: true, phone: true } },
      reportees: { where: { deletedAt: null }, select: { id: true, agentNumber: true, firstName: true, lastName: true, companyName: true, status: true } },
    },
  });

  if (!agent) {
    throw new Error('Agent profile not linked to this user');
  }

  const policyWhere: Prisma.PolicyWhereInput = { deletedAt: null, agentId: agent.id };
  const commissionWhere: Prisma.CommissionEntryWhereInput = { agentId: agent.id };

  const [
    policies,
    commissions,
    tasks,
    leads,
    clients,
    claims,
    policyStats,
    commissionStats,
    renewals,
  ] = await Promise.all([
    prisma.policy.findMany({
      where: policyWhere,
      orderBy: { createdAt: 'desc' },
      take: 30,
      include: {
        client: { select: { id: true, clientNumber: true, firstName: true, lastName: true, companyName: true, tradingName: true, email: true, phone: true } },
        insurer: { select: { id: true, name: true, shortName: true } },
        product: { select: { id: true, name: true, code: true, category: true } },
      },
    }),
    prisma.commissionEntry.findMany({
      where: commissionWhere,
      orderBy: { earnedDate: 'desc' },
      take: 40,
      include: {
        policy: { select: { id: true, policyNumber: true, status: true } },
        insurer: { select: { id: true, name: true, shortName: true } },
        product: { select: { id: true, name: true, code: true } },
      },
    }),
    prisma.task.findMany({
      where: {
        OR: [{ agentId: agent.id }, { assignedToId: userId }],
        status: { notIn: ['COMPLETED', 'CANCELLED'] },
      },
      orderBy: [{ dueDate: 'asc' }, { priority: 'desc' }],
      take: 25,
      include: {
        lead: { select: { id: true, name: true, status: true, priority: true } },
        client: { select: { id: true, clientNumber: true, firstName: true, lastName: true, companyName: true } },
        policy: { select: { id: true, policyNumber: true, status: true } },
        claim: { select: { id: true, claimNumber: true, status: true, priority: true } },
      },
    }),
    prisma.lead.findMany({
      where: {
        deletedAt: null,
        OR: [
          { agentId: agent.id },
          { assignedToId: userId },
          { referrerId: agent.id },
        ],
      },
      orderBy: [{ nextFollowUp: 'asc' }, { createdAt: 'desc' }],
      take: 30,
      include: { assignedTo: { select: { id: true, firstName: true, lastName: true } } },
    }),
    prisma.client.findMany({
      where: {
        deletedAt: null,
        OR: [
          { agentId: agent.id },
          { relationshipManagerId: userId },
          { policies: { some: { agentId: agent.id, deletedAt: null } } },
        ],
      },
      orderBy: { updatedAt: 'desc' },
      take: 30,
      include: {
        policies: {
          where: { agentId: agent.id, deletedAt: null },
          select: { id: true, policyNumber: true, status: true, endDate: true, totalPremium: true, outstandingAmount: true },
          take: 8,
        },
        claims: {
          select: { id: true, claimNumber: true, status: true, priority: true },
          take: 5,
        },
      },
    }),
    prisma.claim.findMany({
      where: {
        deletedAt: null,
        policy: { agentId: agent.id },
      },
      orderBy: [{ priority: 'desc' }, { dateReported: 'desc' }],
      take: 20,
      include: {
        policy: { select: { id: true, policyNumber: true } },
        client: { select: { id: true, clientNumber: true, firstName: true, lastName: true, companyName: true } },
      },
    }),
    prisma.policy.aggregate({ where: policyWhere, _count: true, _sum: { totalPremium: true, outstandingAmount: true } }),
    prisma.commissionEntry.groupBy({
      by: ['status'],
      where: commissionWhere,
      _sum: { grossCommission: true, netCommission: true },
      _count: true,
    }),
    prisma.policy.findMany({
      where: { ...policyWhere, status: 'ACTIVE', endDate: { gte: new Date(), lte: new Date(Date.now() + 90 * 86400000) } },
      orderBy: { endDate: 'asc' },
      take: 20,
      include: { client: { select: { clientNumber: true, firstName: true, lastName: true, companyName: true } }, insurer: { select: { name: true, shortName: true } } },
    }),
  ]);

  const commissionTotals = commissionStats.reduce(
    (totals, row) => {
      totals.count += row._count;
      totals.gross += money(row._sum.grossCommission);
      totals.net += money(row._sum.netCommission);
      if (['PAID', 'RECEIVED'].includes(row.status)) totals.paid += money(row._sum.netCommission);
      if (['CALCULATED', 'PENDING_APPROVAL', 'APPROVED', 'PAYABLE', 'HELD'].includes(row.status)) totals.pending += money(row._sum.netCommission);
      if (['CLAWED_BACK', 'WRITTEN_OFF', 'CANCELLED'].includes(row.status)) totals.adjustments += money(row._sum.netCommission);
      return totals;
    },
    { count: 0, gross: 0, net: 0, paid: 0, pending: 0, adjustments: 0 },
  );

  const openLeadCount = leads.filter((lead) => !['WON', 'LOST', 'DORMANT'].includes(lead.status)).length;
  const activePolicyCount = policies.filter((policy) => policy.status === 'ACTIVE').length;

  return {
    agent: {
      ...agent,
      displayName: `${agent.firstName ?? ''} ${agent.lastName ?? ''}`.trim() || agent.companyName || agent.agentNumber,
    },
    dashboard: {
      kpis: [
        { label: 'Assigned leads', value: openLeadCount },
        { label: 'Assigned clients', value: clients.length },
        { label: 'Active policies', value: activePolicyCount },
        { label: 'Premium book', value: money(policyStats._sum.totalPremium), format: 'money' },
        { label: 'Outstanding premium', value: money(policyStats._sum.outstandingAmount), format: 'money' },
        { label: 'Pending commission', value: commissionTotals.pending, format: 'money' },
      ],
      policyStats: {
        totalPolicies: policyStats._count,
        activePolicyCount,
        grossPremium: money(policyStats._sum.totalPremium),
        outstandingPremium: money(policyStats._sum.outstandingAmount),
      },
      commissionTotals,
    },
    leads,
    clients: clients.map((client) => ({ ...client, displayName: clientDisplayName(client) })),
    policies,
    renewals,
    claims,
    tasks,
    commissions,
  };
}
