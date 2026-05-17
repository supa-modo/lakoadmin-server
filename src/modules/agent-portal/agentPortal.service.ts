import {
  Agent,
  AgentCommissionStatus,
  LeadProposalStatus,
  LeadStatus,
  PolicyStatus,
  Prisma,
  TaskPriority,
  TaskStatus,
} from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/client';
import { prisma } from '../../config/database';
import {
  CreateAgentLeadInput,
  CreateAgentTaskInput,
  CreateLeadCommunicationInput,
  CreateLeadProposalInput,
  ConvertAgentLeadInput,
  UpdateAgentLeadInput,
  UpdateAgentProfileInput,
  UpdateAgentTaskInput,
  UpdateLeadProposalInput,
} from './agentPortal.validation';
import { assertLeadOwnedByAgent } from '../../middleware/agentPortal';
import { generatePolicyNumber } from '../policies/policyNumber.service';

async function nextProposalNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `LPR-${year}-`;
  const count = await prisma.leadProposal.count({
    where: { proposalNumber: { startsWith: prefix } },
  });
  return `${prefix}${String(count + 1).padStart(5, '0')}`;
}

function leadScope(agent: Agent, userId: string): Prisma.LeadWhereInput {
  return {
    deletedAt: null,
    agentId: agent.id,
  };
}

function clientScope(agent: Agent, userId: string): Prisma.ClientWhereInput {
  return {
    deletedAt: null,
    OR: [
      { agentId: agent.id },
      { policies: { some: { agentId: agent.id, deletedAt: null } } },
    ],
  };
}

function policyScope(agent: Agent): Prisma.PolicyWhereInput {
  return { deletedAt: null, agentId: agent.id };
}

function scopedDocumentsWhere(): Prisma.DocumentWhereInput {
  return {
    deletedAt: null,
    isConfidential: false,
  };
}

function taskScope(agent: Agent, userId: string): Prisma.TaskWhereInput {
  return {
    OR: [
      { agentId: agent.id },
      { assignedToId: userId },
      { createdById: userId },
      { lead: { is: { agentId: agent.id, deletedAt: null } } },
      {
        client: {
          is: {
            deletedAt: null,
            OR: [
              { agentId: agent.id },
              { relationshipManagerId: userId },
              { policies: { some: { agentId: agent.id, deletedAt: null } } },
            ],
          },
        },
      },
      { policy: { is: { agentId: agent.id, deletedAt: null } } },
    ],
  };
}

function agentName(agent: Agent): string {
  return (
    `${agent.firstName ?? ''} ${agent.lastName ?? ''}`.trim()
    || agent.companyName
    || agent.agentNumber
  );
}

function startOfDay(value: Date): Date {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate(), 0, 0, 0, 0);
}

function endOfDay(value: Date): Date {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate(), 23, 59, 59, 999);
}

function startOfMonth(value: Date): Date {
  return new Date(value.getFullYear(), value.getMonth(), 1, 0, 0, 0, 0);
}

function decimalNumber(value: Decimal | number | string | null | undefined): number {
  if (value == null) return 0;
  if (value instanceof Decimal) return value.toNumber();
  return Number(value) || 0;
}

function groupCount(value: unknown): number {
  if (typeof value === 'number') return value;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return Number(record._all ?? Object.values(record)[0] ?? 0) || 0;
  }
  return 0;
}

const openTaskStatuses: TaskStatus[] = ['PENDING', 'IN_PROGRESS'];
const pendingPolicyStatuses: PolicyStatus[] = ['DRAFT', 'PENDING_PAYMENT', 'PENDING_UNDERWRITING'];
const agentCommissionStatuses: AgentCommissionStatus[] = ['PENDING', 'APPROVED', 'PAYABLE', 'PAID', 'CANCELLED', 'REVERSED'];

function dateRange(value?: string): { gte: Date; lte: Date } | undefined {
  if (!value) return undefined;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return { gte: startOfDay(parsed), lte: endOfDay(parsed) };
}

function dateFrom(value: unknown): Date | undefined {
  if (!value) return undefined;
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function normalizeTaskPriority(priority?: string | null): TaskPriority | undefined {
  if (!priority) return undefined;
  return priority === 'MEDIUM' ? 'NORMAL' : priority as TaskPriority;
}

function normalizeTaskStatus(status?: string | null): TaskStatus | 'OVERDUE' | undefined {
  if (!status) return undefined;
  if (status === 'TODO') return 'PENDING';
  return status as TaskStatus | 'OVERDUE';
}

function resolveTaskLink(data: CreateAgentTaskInput): { leadId?: string | null; clientId?: string | null; policyId?: string | null } {
  const link = {
    leadId: data.leadId ?? null,
    clientId: data.clientId ?? null,
    policyId: data.policyId ?? null,
  };

  if (data.relatedEntityType && data.relatedEntityType !== 'GENERAL' && data.relatedEntityId) {
    return {
      leadId: data.relatedEntityType === 'LEAD' ? data.relatedEntityId : null,
      clientId: data.relatedEntityType === 'CLIENT' ? data.relatedEntityId : null,
      policyId: data.relatedEntityType === 'POLICY' ? data.relatedEntityId : null,
    };
  }

  return link;
}

function taskRelatedEntity(task: { leadId?: string | null; clientId?: string | null; policyId?: string | null }) {
  if (task.leadId) return { relatedEntityType: 'LEAD', relatedEntityId: task.leadId };
  if (task.clientId) return { relatedEntityType: 'CLIENT', relatedEntityId: task.clientId };
  if (task.policyId) return { relatedEntityType: 'POLICY', relatedEntityId: task.policyId };
  return { relatedEntityType: 'GENERAL', relatedEntityId: null };
}

const proposalInclude = {
  lead: { select: { id: true, name: true, status: true, stage: true, phone: true, email: true, agentId: true } },
  product: { select: { id: true, name: true, code: true } },
  insurer: { select: { id: true, name: true, shortName: true } },
  agent: { select: { id: true, agentNumber: true, firstName: true, lastName: true, companyName: true } },
} satisfies Prisma.LeadProposalInclude;

function formatProposal<T extends { status: LeadProposalStatus; notes?: string | null; premiumAmount?: Decimal | number | string | null }>(proposal: T) {
  return {
    ...proposal,
    premiumAmount: decimalNumber(proposal.premiumAmount),
    rejectionReason: proposal.status === 'REJECTED' ? proposal.notes ?? null : null,
  };
}

function proposalDateRange(from?: unknown, to?: unknown): Prisma.DateTimeFilter | undefined {
  const start = dateFrom(from);
  const end = dateFrom(to);
  if (!start && !end) return undefined;
  return {
    ...(start && { gte: startOfDay(start) }),
    ...(end && { lte: endOfDay(end) }),
  };
}

function shouldMoveLeadToProposalSent(stage?: string | null, status?: LeadStatus | null): boolean {
  const current = stage ?? status;
  return !current || ['NEW', 'CONTACTED', 'QUALIFIED'].includes(current);
}

async function nextAgentClientNumber(tx: Prisma.TransactionClient): Promise<string> {
  const lastClient = await tx.client.findFirst({
    orderBy: { createdAt: 'desc' },
    select: { clientNumber: true },
  });
  const lastNumber = lastClient?.clientNumber?.split('-')[1];
  const nextNumber = (parseInt(lastNumber ?? '0', 10) || 0) + 1;
  return `CL-${nextNumber.toString().padStart(6, '0')}`;
}

function splitName(fullName: string): { firstName: string; lastName: string | null } {
  const parts = fullName.trim().split(/\s+/);
  return {
    firstName: parts[0] || fullName,
    lastName: parts.slice(1).join(' ') || null,
  };
}

function resolvePolicyDates(start?: string | null, end?: string | null): { startDate: Date; endDate: Date } {
  const startDate = start ? new Date(start) : new Date();
  if (Number.isNaN(startDate.getTime())) throw new Error('Invalid policy start date');
  const endDate = end ? new Date(end) : new Date(startDate);
  if (!end) endDate.setFullYear(endDate.getFullYear() + 1);
  if (Number.isNaN(endDate.getTime()) || endDate <= startDate) throw new Error('Policy end date must be after start date');
  return { startDate, endDate };
}

function leadCaptureNotes(data: CreateAgentLeadInput): string | null {
  const details = [
    data.notes,
    data.location || data.county ? `Location: ${data.location || data.county}` : null,
    data.occupation ? `Occupation/business: ${data.occupation}` : null,
    data.business ? `Business: ${data.business}` : null,
    data.productCategory ? `Product category: ${data.productCategory}` : null,
    data.productInterested ? `Product interested in: ${data.productInterested}` : null,
    data.preferredInsurer ? `Preferred insurer: ${data.preferredInsurer}` : null,
    data.budgetRange ? `Budget range: ${data.budgetRange}` : null,
    data.expectedStartDate ? `Expected start date: ${data.expectedStartDate}` : null,
    data.preferredContactMethod ? `Preferred contact method: ${data.preferredContactMethod}` : null,
  ].filter(Boolean);

  return details.length ? details.join('\n') : null;
}

function normalizeLeadProducts(data: CreateAgentLeadInput): string[] {
  return Array.from(
    new Set(
      [
        ...(data.productsOfInterest ?? []),
        data.productCategory ?? undefined,
        data.productInterested ?? undefined,
      ]
        .map((item) => item?.trim())
        .filter((item): item is string => Boolean(item)),
    ),
  );
}

function leadName(data: CreateAgentLeadInput): string {
  return data.name?.trim() || `${data.firstName ?? ''} ${data.lastName ?? ''}`.trim();
}

function sourceFilterVariants(value: string): string[] {
  const trimmed = value.trim();
  return Array.from(new Set([
    trimmed,
    trimmed.replace(/_/g, ' '),
    trimmed.replace(/_/g, '-'),
  ]));
}

function stageToStatus(stage: string | null | undefined): LeadStatus | undefined {
  switch (stage) {
    case 'NEW':
      return 'NEW';
    case 'CONTACTED':
      return 'CONTACTED';
    case 'QUALIFIED':
      return 'QUALIFIED';
    case 'PROPOSAL_SENT':
      return 'PROPOSAL_SENT';
    case 'NEGOTIATING':
    case 'READY_FOR_ONBOARDING':
      return 'NEGOTIATING';
    case 'LOST':
      return 'LOST';
    default:
      return undefined;
  }
}

function statusToStage(status: LeadStatus | undefined): string | undefined {
  if (!status) return undefined;
  if (status === 'NEGOTIATING') return 'NEGOTIATING';
  return status;
}

export async function getAgentDashboard(agent: Agent, userId: string) {
  const now = new Date();
  const todayStart = startOfDay(now);
  const todayEnd = endOfDay(now);
  const monthStart = startOfMonth(now);
  const baseLeadScope = leadScope(agent, userId);
  const baseTaskScope = taskScope(agent, userId);
  const basePolicyScope = policyScope(agent);
  const commissionScope: Prisma.AgentCommissionWhereInput = { agentId: agent.id };

  const openTaskWhere: Prisma.TaskWhereInput = {
    AND: [baseTaskScope, { status: { in: openTaskStatuses } }],
  };

  const [
    totalLeads,
    newLeads,
    qualifiedLeads,
    proposalsSent,
    acceptedProposals,
    convertedClients,
    activePolicies,
    pendingPolicies,
    tasksDueToday,
    overdueTasks,
    pendingCommissionAgg,
    approvedCommissionAgg,
    paidThisMonthAgg,
    totalPaidAgg,
    monthlyPremiumAgg,
    recentLeads,
    upcomingTasks,
    tasksDueTodayList,
    overdueTaskList,
    recentCommissionUpdates,
    followUpsDue,
    recentProposals,
    leadStatusGroups,
    leadStageGroups,
  ] = await Promise.all([
    prisma.lead.count({ where: baseLeadScope }),
    prisma.lead.count({ where: { AND: [baseLeadScope, { status: 'NEW' }] } }),
    prisma.lead.count({
      where: {
        AND: [
          baseLeadScope,
          { OR: [{ status: 'QUALIFIED' }, { stage: { equals: 'QUALIFIED', mode: 'insensitive' } }] },
        ],
      },
    }),
    prisma.leadProposal.count({ where: { agentId: agent.id, status: 'SENT' } }),
    prisma.leadProposal.count({ where: { agentId: agent.id, status: 'ACCEPTED' } }),
    prisma.client.count({
      where: {
        AND: [
          clientScope(agent, userId),
          { OR: [{ convertedFromLeadId: { not: null } }, { policies: { some: { agentId: agent.id, deletedAt: null } } }] },
        ],
      },
    }),
    prisma.policy.count({ where: { ...basePolicyScope, status: 'ACTIVE' } }),
    prisma.policy.count({ where: { ...basePolicyScope, status: { in: pendingPolicyStatuses } } }),
    prisma.task.count({
      where: { AND: [openTaskWhere, { dueDate: { gte: todayStart, lte: todayEnd } }] },
    }),
    prisma.task.count({
      where: { AND: [openTaskWhere, { dueDate: { lt: todayStart } }] },
    }),
    prisma.agentCommission.aggregate({
      where: { ...commissionScope, status: 'PENDING' },
      _sum: { commissionAmount: true },
      _count: true,
    }),
    prisma.agentCommission.aggregate({
      where: { ...commissionScope, status: { in: ['APPROVED', 'PAYABLE'] } },
      _sum: { commissionAmount: true },
      _count: true,
    }),
    prisma.agentCommission.aggregate({
      where: { ...commissionScope, status: 'PAID', paidAt: { gte: monthStart, lte: now } },
      _sum: { commissionAmount: true },
      _count: true,
    }),
    prisma.agentCommission.aggregate({
      where: { ...commissionScope, status: 'PAID' },
      _sum: { commissionAmount: true },
      _count: true,
    }),
    prisma.policy.aggregate({
      where: { ...basePolicyScope, createdAt: { gte: monthStart, lte: now } },
      _sum: { totalPremium: true },
      _count: true,
    }),
    prisma.lead.findMany({
      where: baseLeadScope,
      take: 6,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
        status: true,
        stage: true,
        priority: true,
        productsOfInterest: true,
        nextFollowUp: true,
        createdAt: true,
      },
    }),
    prisma.task.findMany({
      where: { AND: [openTaskWhere, { dueDate: { gte: now } }] },
      take: 6,
      orderBy: [{ dueDate: 'asc' }, { priority: 'desc' }],
      select: {
        id: true,
        title: true,
        dueDate: true,
        priority: true,
        status: true,
        lead: { select: { id: true, name: true } },
        client: { select: { id: true, clientNumber: true, firstName: true, lastName: true, companyName: true } },
        policy: { select: { id: true, policyNumber: true } },
      },
    }),
    prisma.task.findMany({
      where: { AND: [openTaskWhere, { dueDate: { gte: todayStart, lte: todayEnd } }] },
      take: 5,
      orderBy: [{ dueDate: 'asc' }, { priority: 'desc' }],
      select: {
        id: true,
        title: true,
        dueDate: true,
        priority: true,
        status: true,
        lead: { select: { id: true, name: true } },
        client: { select: { id: true, clientNumber: true, firstName: true, lastName: true, companyName: true } },
        policy: { select: { id: true, policyNumber: true } },
      },
    }),
    prisma.task.findMany({
      where: { AND: [openTaskWhere, { dueDate: { lt: todayStart } }] },
      take: 5,
      orderBy: [{ dueDate: 'asc' }, { priority: 'desc' }],
      select: {
        id: true,
        title: true,
        dueDate: true,
        priority: true,
        status: true,
        lead: { select: { id: true, name: true } },
        client: { select: { id: true, clientNumber: true, firstName: true, lastName: true, companyName: true } },
        policy: { select: { id: true, policyNumber: true } },
      },
    }),
    prisma.agentCommission.findMany({
      where: commissionScope,
      take: 6,
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        status: true,
        commissionAmount: true,
        premiumAmount: true,
        earnedAt: true,
        approvedAt: true,
        paidAt: true,
        updatedAt: true,
        policy: { select: { id: true, policyNumber: true, status: true } },
        client: { select: { id: true, clientNumber: true, firstName: true, lastName: true, companyName: true } },
      },
    }),
    prisma.lead.findMany({
      where: {
        AND: [
          baseLeadScope,
          { nextFollowUp: { lte: todayEnd } },
          { status: { notIn: ['WON', 'LOST', 'DORMANT'] } },
        ],
      },
      take: 6,
      orderBy: [{ nextFollowUp: 'asc' }, { priority: 'desc' }],
      select: {
        id: true,
        name: true,
        phone: true,
        status: true,
        stage: true,
        priority: true,
        nextFollowUp: true,
        productsOfInterest: true,
      },
    }),
    prisma.leadProposal.findMany({
      where: { agentId: agent.id },
      take: 6,
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        proposalNumber: true,
        status: true,
        premiumAmount: true,
        sentAt: true,
        acceptedAt: true,
        updatedAt: true,
        lead: { select: { id: true, name: true, status: true } },
        product: { select: { id: true, name: true, code: true } },
        insurer: { select: { id: true, name: true, shortName: true } },
      },
    }),
    prisma.lead.groupBy({
      by: ['status'],
      where: baseLeadScope,
      _count: true,
    }),
    prisma.lead.groupBy({
      by: ['stage'],
      where: { AND: [baseLeadScope, { stage: { not: null } }] },
      _count: true,
    }),
  ]);

  return {
    agent: {
      id: agent.id,
      agentNumber: agent.agentNumber,
      agentCode: agent.agentCode,
      displayName: agentName(agent),
      firstName: agent.firstName,
      lastName: agent.lastName,
      companyName: agent.companyName,
      status: agent.status,
    },
    summary: {
      totalLeads,
      newLeads,
      qualifiedLeads,
      proposalsSent,
      acceptedProposals,
      convertedClients,
      activePolicies,
      pendingPolicies,
      tasksDueToday,
      overdueTasks,
      pendingCommissions: decimalNumber(pendingCommissionAgg._sum.commissionAmount),
      pendingCommissionCount: pendingCommissionAgg._count,
      approvedCommissions: decimalNumber(approvedCommissionAgg._sum.commissionAmount),
      approvedCommissionCount: approvedCommissionAgg._count,
      paidCommissionsThisMonth: decimalNumber(paidThisMonthAgg._sum.commissionAmount),
      paidCommissionsThisMonthCount: paidThisMonthAgg._count,
      totalCommissionPaid: decimalNumber(totalPaidAgg._sum.commissionAmount),
      totalCommissionPaidCount: totalPaidAgg._count,
      monthlyPremiumVolume: decimalNumber(monthlyPremiumAgg._sum.totalPremium),
      monthlyPolicyCount: monthlyPremiumAgg._count,
    },
    leadStatusSummary: leadStatusGroups.map((item) => ({
      label: item.status,
      value: groupCount(item._count),
    })),
    leadStageSummary: leadStageGroups.map((item) => ({
      label: item.stage ?? 'UNSTAGED',
      value: groupCount(item._count),
    })),
    conversionFunnel: [
      { label: 'New leads', value: newLeads },
      { label: 'Qualified', value: qualifiedLeads },
      { label: 'Proposals sent', value: proposalsSent },
      { label: 'Accepted', value: acceptedProposals },
      { label: 'Converted clients', value: convertedClients },
    ],
    recentLeads,
    upcomingTasks,
    tasksDueTodayList,
    overdueTaskList,
    recentCommissionUpdates: recentCommissionUpdates.map((item) => ({
      ...item,
      commissionAmount: decimalNumber(item.commissionAmount),
      premiumAmount: decimalNumber(item.premiumAmount),
    })),
    followUpsDue,
    recentProposals: recentProposals.map((item) => ({
      ...item,
      premiumAmount: decimalNumber(item.premiumAmount),
    })),
  };
}

export async function getAgentProfile(agent: Agent) {
  const full = await prisma.agent.findFirst({
    where: { id: agent.id, deletedAt: null },
    include: {
      manager: {
        select: { id: true, agentNumber: true, agentCode: true, firstName: true, lastName: true, companyName: true, email: true, phone: true },
      },
      user: {
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          phone: true,
          avatarUrl: true,
          isActive: true,
          lastLoginAt: true,
          passwordChangedAt: true,
          communicationPreferences: {
            orderBy: [{ channel: 'asc' }, { category: 'asc' }],
            select: { id: true, channel: true, category: true, isOptedIn: true, updatedAt: true },
          },
        },
      },
    },
  });
  if (!full) throw new Error('Agent not found');

  const [totalLeads, convertedClients, activePolicies, totalPaidAgg] = await Promise.all([
    prisma.lead.count({ where: { agentId: agent.id, deletedAt: null } }),
    prisma.client.count({ where: { deletedAt: null, agentId: agent.id } }),
    prisma.policy.count({ where: { deletedAt: null, agentId: agent.id, status: 'ACTIVE' } }),
    prisma.agentCommission.aggregate({ where: { agentId: agent.id, status: 'PAID' }, _sum: { commissionAmount: true } }),
  ]);

  return {
    id: full.id,
    user: full.user,
    agent: {
      id: full.id,
      agentNumber: full.agentNumber,
      agentCode: full.agentCode,
      type: full.type,
      firstName: full.firstName,
      lastName: full.lastName,
      companyName: full.companyName,
      email: full.email,
      phone: full.phone,
      address: full.address,
      status: full.status,
      region: null,
      branch: null,
      recruitmentDate: full.recruitmentDate,
      joiningDate: full.recruitmentDate ?? full.createdAt,
      createdAt: full.createdAt,
      updatedAt: full.updatedAt,
      manager: full.manager,
    },
    contactDetails: {
      phone: full.phone,
      email: full.email,
      address: full.address,
      profilePhotoUrl: full.user?.avatarUrl ?? null,
    },
    paymentDetails: {
      mpesaNumber: full.mpesaNumber,
      bankName: full.bankName,
      bankBranch: full.bankBranch,
      bankAccountName: full.bankAccountName,
      bankAccountNumber: full.bankAccountNumber,
    },
    notificationPreferences: full.user?.communicationPreferences ?? [],
    activitySummary: {
      totalLeads,
      convertedClients,
      activePolicies,
      totalCommissionsPaid: decimalNumber(totalPaidAgg._sum.commissionAmount),
    },
    restrictedFields: {
      agentCode: full.agentCode,
      status: full.status,
      nationalId: full.nationalId,
      kraPin: full.kraPin,
      supervisorId: full.managerId,
      defaultCommissionRate: decimalNumber(full.defaultCommissionRate),
      withholdingTaxRate: decimalNumber(full.withholdingTaxRate),
    },
  };
}

export async function updateAgentProfile(agent: Agent, userId: string, data: UpdateAgentProfileInput) {
  await prisma.$transaction(async (tx) => {
    const updated = await tx.agent.update({
      where: { id: agent.id },
      data: {
        ...(data.phone !== undefined && { phone: data.phone }),
        ...(data.email !== undefined && { email: data.email }),
        ...(data.address !== undefined && { address: data.address }),
        ...(data.bankName !== undefined && { bankName: data.bankName }),
        ...(data.bankBranch !== undefined && { bankBranch: data.bankBranch }),
        ...(data.bankAccountName !== undefined && { bankAccountName: data.bankAccountName }),
        ...(data.bankAccountNumber !== undefined && { bankAccountNumber: data.bankAccountNumber }),
        ...(data.mpesaNumber !== undefined && { mpesaNumber: data.mpesaNumber }),
        ...(data.notes !== undefined && { notes: data.notes }),
      },
      select: { userId: true },
    });

    const linkedUserId = updated.userId ?? userId;
    if (linkedUserId && (data.email !== undefined || data.phone !== undefined || data.profilePhotoUrl !== undefined)) {
      await tx.user.update({
        where: { id: linkedUserId },
        data: {
          ...(data.email !== undefined && { email: data.email }),
          ...(data.phone !== undefined && { phone: data.phone }),
          ...(data.profilePhotoUrl !== undefined && { avatarUrl: data.profilePhotoUrl }),
        },
      });
    }

    if (linkedUserId && data.notificationPreferences?.length) {
      await Promise.all(data.notificationPreferences.map((preference) => tx.communicationPreference.upsert({
        where: {
          userId_channel_category: {
            userId: linkedUserId,
            channel: preference.channel,
            category: preference.category,
          },
        },
        update: {
          isOptedIn: preference.isOptedIn,
          optedOutAt: preference.isOptedIn ? null : new Date(),
          reason: preference.isOptedIn ? null : 'Updated by agent profile',
        },
        create: {
          userId: linkedUserId,
          channel: preference.channel,
          category: preference.category,
          isOptedIn: preference.isOptedIn,
          optedOutAt: preference.isOptedIn ? null : new Date(),
          reason: preference.isOptedIn ? null : 'Updated by agent profile',
        },
      })));
    }
  });

  return getAgentProfile(agent);
}

export async function listAgentLeads(
  agent: Agent,
  userId: string,
  query: Record<string, unknown>,
) {
  const page = Math.max(1, parseInt(String(query.page ?? 1), 10) || 1);
  const limit = Math.min(100, parseInt(String(query.limit ?? 20), 10) || 20);
  const search = String(query.search ?? '').trim();
  const status = query.status as LeadStatus | undefined;
  const stage = query.stage ? String(query.stage) : undefined;
  const source = query.source ? String(query.source) : undefined;
  const productInterest = query.productInterest ? String(query.productInterest).trim() : undefined;
  const nextFollowUpDate = query.nextFollowUpDate ? String(query.nextFollowUpDate) : undefined;
  const createdFrom = dateFrom(query.from ?? query.createdFrom ?? query.startDate);
  const createdTo = dateFrom(query.to ?? query.createdTo ?? query.endDate);
  const sort = String(query.sort ?? 'newest');

  const filters: Prisma.LeadWhereInput[] = [leadScope(agent, userId)];
  if (status) filters.push({ status });
  if (stage) filters.push({ stage: { equals: stage, mode: 'insensitive' } });
  if (source) {
    filters.push({
      OR: sourceFilterVariants(source).map((item) => ({ source: { equals: item, mode: 'insensitive' } })),
    });
  }
  if (productInterest) filters.push({ productsOfInterest: { has: productInterest } });
  const followUpRange = dateRange(nextFollowUpDate);
  if (followUpRange) filters.push({ nextFollowUp: followUpRange });
  if (createdFrom || createdTo) {
    filters.push({
      createdAt: {
        ...(createdFrom && { gte: startOfDay(createdFrom) }),
        ...(createdTo && { lte: endOfDay(createdTo) }),
      },
    });
  }
  if (search) {
    filters.push({
      OR: [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } },
        { companyName: { contains: search, mode: 'insensitive' } },
      ],
    });
  }

  const where: Prisma.LeadWhereInput = { AND: filters };
  const orderBy: Prisma.LeadOrderByWithRelationInput[] = (() => {
    switch (sort) {
      case 'oldest':
        return [{ createdAt: 'asc' }];
      case 'next-follow-up':
      case 'nextFollowUp':
        return [{ nextFollowUp: 'asc' }, { createdAt: 'desc' }];
      case 'priority':
        return [{ priority: 'asc' }, { createdAt: 'desc' }];
      case 'last-contacted':
      case 'lastContacted':
        return [{ updatedAt: 'desc' }];
      case 'newest':
      default:
        return [{ createdAt: 'desc' }];
    }
  })();

  const [leads, total] = await Promise.all([
    prisma.lead.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy,
      include: {
        agent: { select: { id: true, agentNumber: true, firstName: true, lastName: true } },
        proposals: { select: { id: true, status: true, premiumAmount: true, sentAt: true } },
        communications: {
          select: { id: true, communicationType: true, occurredAt: true, outcome: true },
          orderBy: { occurredAt: 'desc' },
          take: 1,
        },
      },
    }),
    prisma.lead.count({ where }),
  ]);

  return { leads, total, page, limit };
}

export async function getAgentLead(agent: Agent, userId: string, leadId: string) {
  const [lead, documents] = await Promise.all([
    prisma.lead.findFirst({
      where: { id: leadId, ...leadScope(agent, userId) },
      include: {
        agent: { select: { id: true, agentNumber: true, firstName: true, lastName: true, companyName: true, email: true, phone: true } },
        assignedTo: { select: { id: true, firstName: true, lastName: true, email: true } },
        createdBy: { select: { id: true, firstName: true, lastName: true } },
        convertedToClient: { select: { id: true, clientNumber: true, firstName: true, lastName: true, companyName: true } },
        dependents: { where: { deletedAt: null } },
        communications: {
          orderBy: { occurredAt: 'desc' },
          take: 50,
          include: { createdBy: { select: { id: true, firstName: true, lastName: true, email: true } } },
        },
        proposals: {
          orderBy: { createdAt: 'desc' },
          include: {
            product: { select: { id: true, name: true, code: true } },
            insurer: { select: { id: true, name: true, shortName: true } },
          },
        },
        tasks: {
          where: { status: { notIn: ['COMPLETED', 'CANCELLED'] } },
          orderBy: [{ dueDate: 'asc' }, { priority: 'desc' }],
          take: 20,
        },
        activities: { orderBy: { createdAt: 'desc' }, take: 30, include: { user: true } },
        _count: { select: { communications: true, proposals: true, tasks: true, dependents: true } },
      },
    }),
    prisma.document.findMany({
      where: {
        deletedAt: null,
        OR: [
          { entityType: 'LEAD', entityId: leadId },
          { relatedEntityType: 'LEAD', relatedEntityId: leadId },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: { id: true, name: true, type: true, status: true, createdAt: true, fileUrl: true },
    }),
  ]);
  if (!lead) throw new Error('Lead not found');

  return {
    ...lead,
    documents,
    summaries: {
      communications: lead._count.communications,
      proposals: lead._count.proposals,
      tasks: lead._count.tasks,
      documents: documents.length,
      dependents: lead._count.dependents,
    },
    conversion: {
      isConverted: Boolean(lead.convertedToClientId),
      convertedAt: lead.convertedAt,
      client: lead.convertedToClient,
      readyForOnboarding: lead.stage === 'READY_FOR_ONBOARDING' || lead.proposals.some((proposal) => proposal.status === 'ACCEPTED'),
    },
  };
}

export async function createAgentLead(
  agent: Agent,
  userId: string,
  data: CreateAgentLeadInput,
) {
  const name = leadName(data);
  if (!name) throw new Error('Lead name is required');

  return prisma.lead.create({
    data: {
      name,
      email: data.email ?? null,
      phone: data.phone,
      companyName: data.companyName ?? data.business ?? null,
      leadType: data.leadType ?? 'INDIVIDUAL',
      source: data.source ?? 'AGENT_PORTAL',
      sourceDetail: data.sourceDetail ?? data.location ?? data.county ?? null,
      status: 'NEW',
      stage: 'NEW',
      priority: data.priority ?? 'WARM',
      productsOfInterest: normalizeLeadProducts(data),
      expectedPremium: data.expectedPremium != null ? new Decimal(data.expectedPremium) : null,
      notes: leadCaptureNotes(data),
      nextFollowUp: data.nextFollowUp ? new Date(data.nextFollowUp) : null,
      agentId: agent.id,
      assignedToId: userId,
      assignedByUserId: userId,
      assignedAt: new Date(),
      createdById: userId,
    },
  });
}

export async function updateAgentLead(
  agent: Agent,
  userId: string,
  leadId: string,
  data: UpdateAgentLeadInput,
) {
  const existing = await prisma.lead.findFirst({ where: { id: leadId, ...leadScope(agent, userId) } });
  if (!existing) throw new Error('Lead not found');
  if (existing.convertedToClientId) throw new Error('Converted leads cannot be edited');

  return prisma.lead.update({
    where: { id: leadId },
    data: {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.email !== undefined && { email: data.email }),
      ...(data.phone !== undefined && { phone: data.phone }),
      ...(data.companyName !== undefined && { companyName: data.companyName }),
      ...(data.leadType !== undefined && { leadType: data.leadType }),
      ...(data.source !== undefined && { source: data.source }),
      ...(data.status !== undefined && { status: data.status as LeadStatus, stage: data.stage ?? statusToStage(data.status as LeadStatus) }),
      ...(data.stage !== undefined && {
        stage: data.stage,
        ...(stageToStatus(data.stage) && { status: stageToStatus(data.stage) }),
      }),
      ...(data.priority !== undefined && { priority: data.priority }),
      ...(data.productsOfInterest !== undefined && { productsOfInterest: data.productsOfInterest }),
      ...(data.expectedPremium !== undefined && {
        expectedPremium: data.expectedPremium != null ? new Decimal(data.expectedPremium) : null,
      }),
      ...(data.notes !== undefined && { notes: data.notes }),
      ...(data.nextFollowUp !== undefined && {
        nextFollowUp: data.nextFollowUp ? new Date(data.nextFollowUp) : null,
      }),
      ...(data.lostReason !== undefined && { lostReason: data.lostReason }),
      ...(data.status === 'LOST' && { lostAt: new Date() }),
    },
  });
}

export async function listLeadCommunications(agent: Agent, userId: string, leadId: string) {
  await getAgentLead(agent, userId, leadId);
  return prisma.leadCommunication.findMany({
    where: { leadId },
    orderBy: { occurredAt: 'desc' },
    include: { createdBy: { select: { id: true, firstName: true, lastName: true, email: true } } },
  });
}

export async function createLeadCommunication(
  agent: Agent,
  userId: string,
  leadId: string,
  data: CreateLeadCommunicationInput,
) {
  await getAgentLead(agent, userId, leadId);
  const body = data.message || data.body || '';
  const comm = await prisma.leadCommunication.create({
    data: {
      leadId,
      agentId: agent.id,
      communicationType: data.communicationType,
      channel: data.communicationType,
      direction: data.direction,
      subject: data.subject ?? null,
      body,
      message: body,
      outcome: data.outcome ?? null,
      followUpRequired: data.followUpRequired ?? false,
      followUpDate: data.followUpDate ? new Date(data.followUpDate) : null,
      occurredAt: data.occurredAt ? new Date(data.occurredAt) : new Date(),
      createdById: userId,
    },
  });

  if (data.followUpRequired && data.followUpDate) {
    await prisma.lead.update({
      where: { id: leadId },
      data: { nextFollowUp: new Date(data.followUpDate), ...(data.outcome === 'READY_TO_ONBOARD' && { stage: 'READY_FOR_ONBOARDING', status: 'NEGOTIATING' }) },
    });
  } else if (data.outcome === 'READY_TO_ONBOARD') {
    await prisma.lead.update({
      where: { id: leadId },
      data: { stage: 'READY_FOR_ONBOARDING', status: 'NEGOTIATING' },
    });
  } else if (data.outcome === 'REQUESTED_PROPOSAL') {
    await prisma.lead.update({
      where: { id: leadId },
      data: { status: 'PROPOSAL_SENT', stage: 'PROPOSAL_SENT', proposalStatus: 'REQUESTED' },
    });
  } else {
    await prisma.lead.update({
      where: { id: leadId, status: 'NEW' },
      data: { status: 'CONTACTED', stage: 'CONTACTED' },
    });
  }

  if (data.createTask && data.followUpDate) {
    await prisma.task.create({
      data: {
        title: data.taskTitle || `Follow up after ${data.communicationType.toLowerCase()}`,
        description: body || data.subject || null,
        dueDate: new Date(data.followUpDate),
        priority: 'NORMAL',
        status: 'PENDING',
        agentId: agent.id,
        assignedToId: userId,
        createdById: userId,
        leadId,
      },
    });
  }

  await prisma.leadActivity.create({
    data: {
      leadId,
      type: 'COMMUNICATION',
      description: `${data.communicationType} logged`,
      userId,
      metadata: { communicationId: comm.id },
    },
  });

  return comm;
}

export async function listAgentProposals(agent: Agent, userId: string, query: Record<string, unknown>) {
  const page = Math.max(1, parseInt(String(query.page ?? 1), 10) || 1);
  const limit = Math.min(100, parseInt(String(query.limit ?? 20), 10) || 20);
  const status = query.status as LeadProposalStatus | undefined;
  const search = String(query.search ?? '').trim();
  const leadId = query.leadId ? String(query.leadId) : undefined;
  const createdAt = proposalDateRange(query.from ?? query.createdFrom ?? query.startDate, query.to ?? query.createdTo ?? query.endDate);

  const filters: Prisma.LeadProposalWhereInput[] = [
    { agentId: agent.id },
    { lead: { is: leadScope(agent, userId) } },
  ];
  if (status) filters.push({ status });
  if (leadId) filters.push({ leadId });
  if (createdAt) filters.push({ createdAt });
  if (search) {
    filters.push({
      OR: [
        { proposalNumber: { contains: search, mode: 'insensitive' } },
        { lead: { is: { name: { contains: search, mode: 'insensitive' }, agentId: agent.id, deletedAt: null } } },
        { product: { is: { name: { contains: search, mode: 'insensitive' } } } },
        { insurer: { is: { name: { contains: search, mode: 'insensitive' } } } },
      ],
    });
  }

  const where: Prisma.LeadProposalWhereInput = { AND: filters };

  const [proposals, total] = await Promise.all([
    prisma.leadProposal.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: proposalInclude,
    }),
    prisma.leadProposal.count({ where }),
  ]);

  return { proposals: proposals.map(formatProposal), total, page, limit };
}

export async function createLeadProposal(
  agent: Agent,
  userId: string,
  leadId: string,
  data: CreateLeadProposalInput,
) {
  await getAgentLead(agent, userId, leadId);
  const proposal = await prisma.leadProposal.create({
    data: {
      proposalNumber: await nextProposalNumber(),
      leadId,
      agentId: agent.id,
      productId: data.productId ?? null,
      insurerId: data.insurerId ?? null,
      premiumAmount: new Decimal(data.premiumAmount),
      coverSummary: data.coverSummary ?? null,
      benefitsSummary: data.benefitsSummary ?? null,
      exclusionsSummary: data.exclusionsSummary ?? null,
      documentUrl: data.documentUrl ?? null,
      notes: data.notes ?? null,
      createdByUserId: userId,
    },
    include: proposalInclude,
  });

  await prisma.leadActivity.create({
    data: {
      leadId,
      type: 'PROPOSAL',
      description: `Proposal ${proposal.proposalNumber} drafted`,
      userId,
      metadata: { proposalId: proposal.id, status: proposal.status },
    },
  });

  return formatProposal(proposal);
}

async function getAgentProposal(agent: Agent, userId: string, proposalId: string) {
  const proposal = await prisma.leadProposal.findFirst({
    where: { id: proposalId, agentId: agent.id, lead: { is: leadScope(agent, userId) } },
    include: proposalInclude,
  });
  if (!proposal) throw new Error('Proposal not found');
  return proposal;
}

export async function getAgentProposalById(agent: Agent, userId: string, proposalId: string) {
  return formatProposal(await getAgentProposal(agent, userId, proposalId));
}

export async function updateAgentProposal(
  agent: Agent,
  userId: string,
  proposalId: string,
  data: UpdateLeadProposalInput,
) {
  const proposal = await getAgentProposal(agent, userId, proposalId);
  if (['ACCEPTED', 'REJECTED', 'CONVERTED'].includes(proposal.status)) {
    throw new Error('Accepted or rejected proposals cannot be modified');
  }
  if (proposal.status !== 'DRAFT') {
    const nonAuditedFields = ['productId', 'insurerId', 'premiumAmount', 'coverSummary', 'benefitsSummary', 'exclusionsSummary'];
    if (nonAuditedFields.some((field) => data[field as keyof UpdateLeadProposalInput] !== undefined)) {
      throw new Error('Only draft proposals can change cover, insurer, product, or premium details');
    }
  }

  const updated = await prisma.leadProposal.update({
    where: { id: proposalId },
    data: {
      ...(data.productId !== undefined && { productId: data.productId }),
      ...(data.insurerId !== undefined && { insurerId: data.insurerId }),
      ...(data.premiumAmount !== undefined && { premiumAmount: new Decimal(data.premiumAmount) }),
      ...(data.coverSummary !== undefined && { coverSummary: data.coverSummary }),
      ...(data.benefitsSummary !== undefined && { benefitsSummary: data.benefitsSummary }),
      ...(data.exclusionsSummary !== undefined && { exclusionsSummary: data.exclusionsSummary }),
      ...(data.documentUrl !== undefined && { documentUrl: data.documentUrl }),
      ...(data.notes !== undefined && { notes: data.notes }),
    },
    include: proposalInclude,
  });

  return formatProposal(updated);
}

export async function markProposalSent(agent: Agent, userId: string, proposalId: string) {
  const proposal = await getAgentProposal(agent, userId, proposalId);
  if (proposal.status !== 'DRAFT') throw new Error('Only draft proposals can be marked as sent');
  const sentAt = new Date();
  const updated = await prisma.leadProposal.update({
    where: { id: proposalId },
    data: { status: 'SENT', sentAt },
    include: proposalInclude,
  });
  if (shouldMoveLeadToProposalSent(proposal.lead.stage, proposal.lead.status)) {
    await prisma.lead.update({
      where: { id: proposal.leadId },
      data: { status: 'PROPOSAL_SENT', stage: 'PROPOSAL_SENT', proposalStatus: 'SENT' },
    });
  }
  await prisma.leadActivity.create({
    data: {
      leadId: proposal.leadId,
      type: 'PROPOSAL',
      description: `Proposal ${proposal.proposalNumber} sent`,
      userId,
      metadata: { proposalId, status: 'SENT', sentAt },
    },
  });
  return formatProposal(updated);
}

export async function markProposalAccepted(agent: Agent, userId: string, proposalId: string) {
  const proposal = await getAgentProposal(agent, userId, proposalId);
  if (proposal.status !== 'SENT') throw new Error('Only sent proposals can be accepted');
  const acceptedAt = new Date();
  const updated = await prisma.leadProposal.update({
    where: { id: proposalId },
    data: { status: 'ACCEPTED', acceptedAt },
    include: proposalInclude,
  });
  await prisma.lead.update({
    where: { id: proposal.leadId },
    data: { status: 'NEGOTIATING', stage: 'READY_FOR_ONBOARDING', proposalStatus: 'ACCEPTED' },
  });
  await prisma.leadActivity.create({
    data: {
      leadId: proposal.leadId,
      type: 'PROPOSAL',
      description: `Proposal ${proposal.proposalNumber} accepted`,
      userId,
      metadata: { proposalId, status: 'ACCEPTED', acceptedAt },
    },
  });
  return formatProposal(updated);
}

export async function markProposalRejected(agent: Agent, userId: string, proposalId: string, notes?: string) {
  const proposal = await getAgentProposal(agent, userId, proposalId);
  if (proposal.status !== 'SENT') throw new Error('Only sent proposals can be rejected');
  const rejectedAt = new Date();
  const updated = await prisma.leadProposal.update({
    where: { id: proposalId },
    data: {
      status: 'REJECTED',
      rejectedAt,
      ...(notes && { notes }),
    },
    include: proposalInclude,
  });
  await prisma.lead.update({
    where: { id: proposal.leadId },
    data: { proposalStatus: 'REJECTED' },
  });
  await prisma.leadActivity.create({
    data: {
      leadId: proposal.leadId,
      type: 'PROPOSAL',
      description: `Proposal ${proposal.proposalNumber} rejected`,
      userId,
      metadata: { proposalId, status: 'REJECTED', rejectedAt, rejectionReason: notes ?? null },
    },
  });
  return formatProposal(updated);
}

export async function listAgentClients(agent: Agent, userId: string, query: Record<string, unknown>) {
  const page = Math.max(1, parseInt(String(query.page ?? 1), 10) || 1);
  const limit = Math.min(100, parseInt(String(query.limit ?? 20), 10) || 20);
  const search = String(query.search ?? '').trim();
  const clientType = query.clientType ? String(query.clientType).toUpperCase() : undefined;
  const policyStatus = query.policyStatus ? String(query.policyStatus).toUpperCase() : undefined;
  const sort = String(query.sort ?? 'recent');

  const filters: Prisma.ClientWhereInput[] = [clientScope(agent, userId)];
  if (search) {
    filters.push({
      OR: [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { companyName: { contains: search, mode: 'insensitive' } },
        { clientNumber: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ],
    });
  }
  if (clientType) filters.push({ type: clientType as Prisma.EnumClientTypeFilter });
  if (policyStatus) filters.push({ policies: { some: { agentId: agent.id, deletedAt: null, status: policyStatus as Prisma.EnumPolicyStatusFilter } } });

  const where: Prisma.ClientWhereInput = { AND: filters };
  const orderBy: Prisma.ClientOrderByWithRelationInput =
    sort === 'oldest' ? { createdAt: 'asc' } :
    sort === 'name' ? { firstName: 'asc' } :
    sort === 'onboarded' ? { onboardedAt: 'desc' } :
    { updatedAt: 'desc' };

  const [clients, total] = await Promise.all([
    prisma.client.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy,
      include: {
        policies: {
          where: { agentId: agent.id, deletedAt: null },
          orderBy: { updatedAt: 'desc' },
          select: {
            id: true,
            policyNumber: true,
            status: true,
            totalPremium: true,
            startDate: true,
            endDate: true,
            insurer: { select: { id: true, name: true, shortName: true } },
            product: { select: { id: true, name: true, code: true } },
          },
          take: 3,
        },
        _count: {
          select: {
            documents: { where: scopedDocumentsWhere() },
          },
        },
      },
    }),
    prisma.client.count({ where }),
  ]);

  const policyCounts = await prisma.policy.groupBy({
    by: ['clientId'],
    where: { agentId: agent.id, deletedAt: null, clientId: { in: clients.map((client) => client.id) } },
    _count: { _all: true },
  });
  const countByClient = new Map(policyCounts.map((item) => [item.clientId, item._count._all]));

  return {
    clients: clients.map((client) => {
      const latestPolicy = client.policies[0] ?? null;
      return {
        id: client.id,
        clientNumber: client.clientNumber,
        type: client.type,
        firstName: client.firstName,
        lastName: client.lastName,
        companyName: client.companyName,
        phone: client.phone,
        email: client.email,
        county: client.county,
        agentId: client.agentId,
        onboardedAt: client.onboardedAt,
        createdAt: client.createdAt,
        updatedAt: client.updatedAt,
        policiesCount: countByClient.get(client.id) ?? 0,
        latestPolicyStatus: latestPolicy?.status ?? null,
        latestPolicy,
        documentsCount: client._count.documents,
      };
    }),
    total,
    page,
    limit,
  };
}

export async function getAgentClient(agent: Agent, userId: string, clientId: string) {
  const client = await prisma.client.findFirst({
    where: { id: clientId, ...clientScope(agent, userId) },
    include: {
      contacts: true,
      dependents: { where: { deletedAt: null } },
      policies: {
        where: { deletedAt: null, agentId: agent.id },
        orderBy: { updatedAt: 'desc' },
        include: {
          insurer: { select: { id: true, name: true, shortName: true } },
          product: { select: { id: true, name: true, code: true, category: true } },
          agentCommissions: {
            where: { agentId: agent.id },
            orderBy: { earnedAt: 'desc' },
            select: { id: true, status: true, commissionAmount: true, earnedAt: true, approvedAt: true, paidAt: true },
          },
        },
      },
      lead: { select: { id: true, name: true, status: true, stage: true, source: true, convertedAt: true, productsOfInterest: true } },
      documents: {
        where: scopedDocumentsWhere(),
        orderBy: { createdAt: 'desc' },
        take: 12,
        select: { id: true, type: true, title: true, name: true, fileUrl: true, status: true, createdAt: true },
      },
      tasks: {
        where: { OR: [{ agentId: agent.id }, { assignedToId: userId }, { createdById: userId }] },
        orderBy: [{ status: 'asc' }, { dueDate: 'asc' }],
        take: 10,
        select: { id: true, title: true, status: true, priority: true, dueDate: true, createdAt: true },
      },
      messageLogs: {
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: { id: true, channel: true, direction: true, subject: true, status: true, createdAt: true },
      },
    },
  });
  if (!client) throw new Error('Client not found');
  return {
    ...client,
    policies: client.policies.map((policy) => ({
      ...policy,
      basePremium: decimalNumber(policy.basePremium),
      totalPremium: decimalNumber(policy.totalPremium),
      outstandingAmount: decimalNumber(policy.outstandingAmount),
      agentCommissions: policy.agentCommissions.map((commission) => ({
        ...commission,
        commissionAmount: decimalNumber(commission.commissionAmount),
      })),
    })),
    policiesCount: client.policies.length,
    latestPolicyStatus: client.policies[0]?.status ?? null,
  };
}

export async function listAgentPolicies(agent: Agent, query: Record<string, unknown>) {
  const page = Math.max(1, parseInt(String(query.page ?? 1), 10) || 1);
  const limit = Math.min(100, parseInt(String(query.limit ?? 20), 10) || 20);
  const status = query.status ? String(query.status).toUpperCase() : undefined;
  const search = String(query.search ?? '').trim();
  const insurerId = query.insurerId ? String(query.insurerId) : undefined;
  const productId = query.productId ? String(query.productId) : undefined;
  const expiringBefore = dateFrom(query.expiringBefore);
  const sort = String(query.sort ?? 'newest');

  const filters: Prisma.PolicyWhereInput[] = [policyScope(agent)];
  if (status) filters.push({ status: status as Prisma.EnumPolicyStatusFilter });
  if (insurerId) filters.push({ insurerId });
  if (productId) filters.push({ productId });
  if (expiringBefore) filters.push({ endDate: { lte: endOfDay(expiringBefore) } });
  if (search) {
    filters.push({
      OR: [
        { policyNumber: { contains: search, mode: 'insensitive' } },
        { insurerPolicyNumber: { contains: search, mode: 'insensitive' } },
        { client: { is: { OR: [
          { firstName: { contains: search, mode: 'insensitive' } },
          { lastName: { contains: search, mode: 'insensitive' } },
          { companyName: { contains: search, mode: 'insensitive' } },
          { clientNumber: { contains: search, mode: 'insensitive' } },
        ] } } },
      ],
    });
  }

  const where: Prisma.PolicyWhereInput = { AND: filters };
  const orderBy: Prisma.PolicyOrderByWithRelationInput =
    sort === 'oldest' ? { createdAt: 'asc' } :
    sort === 'renewal' ? { endDate: 'asc' } :
    sort === 'premium' ? { totalPremium: 'desc' } :
    { createdAt: 'desc' };

  const [policies, total] = await Promise.all([
    prisma.policy.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy,
      include: {
        client: { select: { id: true, clientNumber: true, firstName: true, lastName: true, companyName: true, phone: true, email: true } },
        insurer: { select: { id: true, name: true, shortName: true } },
        product: { select: { id: true, name: true, code: true } },
        agentCommissions: {
          where: { agentId: agent.id },
          orderBy: { earnedAt: 'desc' },
          take: 1,
          select: { id: true, status: true, commissionAmount: true, earnedAt: true, approvedAt: true, paidAt: true },
        },
      },
    }),
    prisma.policy.count({ where }),
  ]);

  return {
    policies: policies.map((policy) => ({
      ...policy,
      basePremium: decimalNumber(policy.basePremium),
      totalPremium: decimalNumber(policy.totalPremium),
      outstandingAmount: decimalNumber(policy.outstandingAmount),
      renewalDate: policy.endDate,
      commissionStatus: policy.agentCommissions[0]?.status ?? null,
      latestCommission: policy.agentCommissions[0]
        ? {
            ...policy.agentCommissions[0],
            commissionAmount: decimalNumber(policy.agentCommissions[0].commissionAmount),
          }
        : null,
    })),
    total,
    page,
    limit,
  };
}

export async function getAgentPolicy(agent: Agent, policyId: string) {
  const policy = await prisma.policy.findFirst({
    where: { id: policyId, ...policyScope(agent) },
    include: {
      client: {
        select: {
          id: true,
          clientNumber: true,
          type: true,
          firstName: true,
          lastName: true,
          companyName: true,
          phone: true,
          email: true,
          county: true,
        },
      },
      insurer: { select: { id: true, name: true, shortName: true, phone: true, email: true } },
      product: { select: { id: true, name: true, code: true, category: true, insuranceClass: true } },
      sourceLead: { select: { id: true, name: true, status: true, stage: true } },
      convertedFromProposal: { select: { id: true, proposalNumber: true, status: true, premiumAmount: true, acceptedAt: true } },
      documents: { orderBy: { createdAt: 'desc' }, take: 20 },
      events: { orderBy: { createdAt: 'desc' }, take: 12 },
      tasks: {
        where: { OR: [{ agentId: agent.id }, { policy: { is: { agentId: agent.id } } }] },
        orderBy: [{ status: 'asc' }, { dueDate: 'asc' }],
        take: 10,
        select: { id: true, title: true, status: true, priority: true, dueDate: true, createdAt: true },
      },
      messageLogs: {
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: { id: true, channel: true, direction: true, subject: true, status: true, createdAt: true },
      },
      agentCommissions: {
        where: { agentId: agent.id },
        orderBy: { earnedAt: 'desc' },
        take: 10,
      },
    },
  });
  if (!policy) throw new Error('Policy not found');
  const genericDocuments = await prisma.document.findMany({
    where: { ...scopedDocumentsWhere(), policyId: policy.id },
    orderBy: { createdAt: 'desc' },
    take: 20,
    select: { id: true, type: true, title: true, name: true, fileUrl: true, status: true, createdAt: true },
  });
  return {
    ...policy,
    basePremium: decimalNumber(policy.basePremium),
    trainingLevy: decimalNumber(policy.trainingLevy),
    pcifLevy: decimalNumber(policy.pcifLevy),
    stampDuty: decimalNumber(policy.stampDuty),
    policyFee: decimalNumber(policy.policyFee),
    totalPremium: decimalNumber(policy.totalPremium),
    paidAmount: decimalNumber(policy.paidAmount),
    outstandingAmount: decimalNumber(policy.outstandingAmount),
    renewalDate: policy.endDate,
    convertedFromProposal: policy.convertedFromProposal
      ? { ...policy.convertedFromProposal, premiumAmount: decimalNumber(policy.convertedFromProposal.premiumAmount) }
      : null,
    agentCommissions: policy.agentCommissions.map((commission) => ({
      ...commission,
      premiumAmount: decimalNumber(commission.premiumAmount),
      commissionRate: decimalNumber(commission.commissionRate),
      commissionAmount: decimalNumber(commission.commissionAmount),
    })),
    commissionStatus: policy.agentCommissions[0]?.status ?? null,
    genericDocuments,
  };
}

export async function listAgentTasks(agent: Agent, userId: string, query: Record<string, unknown>) {
  const page = Math.max(1, parseInt(String(query.page ?? 1), 10) || 1);
  const limit = Math.min(100, parseInt(String(query.limit ?? 50), 10) || 50);
  const now = new Date();
  const todayStart = startOfDay(now);
  const todayEnd = endOfDay(now);
  const monthStart = startOfMonth(now);
  const status = normalizeTaskStatus(query.status ? String(query.status) : undefined);
  const priority = normalizeTaskPriority(query.priority ? String(query.priority) : undefined);
  const dueDate = query.dueDate ? dateRange(String(query.dueDate)) : undefined;
  const relatedEntityType = query.relatedEntityType ? String(query.relatedEntityType).toUpperCase() : undefined;
  const baseScope = taskScope(agent, userId);
  const filters: Prisma.TaskWhereInput[] = [baseScope];

  if (status === 'OVERDUE') {
    filters.push({ status: { in: openTaskStatuses }, dueDate: { lt: todayStart } });
  } else if (status) {
    filters.push({ status });
  }
  if (priority) filters.push({ priority });
  if (dueDate) filters.push({ dueDate });
  if (relatedEntityType === 'LEAD') filters.push({ leadId: { not: null } });
  if (relatedEntityType === 'CLIENT') filters.push({ clientId: { not: null } });
  if (relatedEntityType === 'POLICY') filters.push({ policyId: { not: null } });
  if (relatedEntityType === 'GENERAL') {
    filters.push({ leadId: null, clientId: null, policyId: null });
  }

  const where: Prisma.TaskWhereInput = { AND: filters };
  const openWhere: Prisma.TaskWhereInput = { AND: [baseScope, { status: { in: openTaskStatuses } }] };

  const [tasks, total, dueToday, overdue, upcoming, completedThisMonth] = await Promise.all([
    prisma.task.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: [{ dueDate: 'asc' }, { priority: 'desc' }],
      include: {
        lead: { select: { id: true, name: true, status: true } },
        client: { select: { id: true, clientNumber: true, firstName: true, lastName: true, companyName: true } },
        policy: { select: { id: true, policyNumber: true, status: true } },
        assignedTo: { select: { id: true, firstName: true, lastName: true, email: true } },
        createdBy: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    }),
    prisma.task.count({ where }),
    prisma.task.count({ where: { AND: [openWhere, { dueDate: { gte: todayStart, lte: todayEnd } }] } }),
    prisma.task.count({ where: { AND: [openWhere, { dueDate: { lt: todayStart } }] } }),
    prisma.task.count({ where: { AND: [openWhere, { dueDate: { gt: todayEnd } }] } }),
    prisma.task.count({ where: { AND: [baseScope, { status: 'COMPLETED', completedAt: { gte: monthStart, lte: now } }] } }),
  ]);

  return {
    tasks: tasks.map((task) => ({ ...task, ...taskRelatedEntity(task) })),
    total,
    page,
    limit,
    summary: {
      dueToday,
      overdue,
      upcoming,
      completedThisMonth,
    },
  };
}

export async function createAgentTask(agent: Agent, userId: string, data: CreateAgentTaskInput) {
  const link = resolveTaskLink(data);

  if (link.leadId) {
    const lead = await prisma.lead.findFirst({ where: { id: link.leadId } });
    if (!assertLeadOwnedByAgent(lead, agent)) throw new Error('Lead not in your book');
  }
  if (link.clientId) {
    const client = await prisma.client.findFirst({ where: { id: link.clientId, ...clientScope(agent, userId) } });
    if (!client) throw new Error('Client not in your book');
  }
  if (link.policyId) {
    const policy = await prisma.policy.findFirst({ where: { id: link.policyId, ...policyScope(agent) } });
    if (!policy) throw new Error('Policy not in your book');
  }

  const task = await prisma.task.create({
    data: {
      title: data.title,
      description: data.description ?? null,
      dueDate: data.dueDate ? new Date(data.dueDate) : null,
      priority: normalizeTaskPriority(data.priority) ?? 'NORMAL',
      status: 'PENDING',
      agentId: agent.id,
      assignedToId: userId,
      createdById: userId,
      leadId: link.leadId ?? null,
      clientId: link.clientId ?? null,
      policyId: link.policyId ?? null,
    },
    include: {
      lead: { select: { id: true, name: true, status: true } },
      client: { select: { id: true, clientNumber: true, firstName: true, lastName: true, companyName: true } },
      policy: { select: { id: true, policyNumber: true, status: true } },
      assignedTo: { select: { id: true, firstName: true, lastName: true, email: true } },
      createdBy: { select: { id: true, firstName: true, lastName: true, email: true } },
    },
  });

  return { ...task, ...taskRelatedEntity(task) };
}

export async function updateAgentTask(
  agent: Agent,
  userId: string,
  taskId: string,
  data: UpdateAgentTaskInput,
) {
  const task = await prisma.task.findFirst({
    where: {
      id: taskId,
      ...taskScope(agent, userId),
    },
  });
  if (!task) throw new Error('Task not found');
  if (['COMPLETED', 'CANCELLED'].includes(task.status)) throw new Error('Completed or cancelled tasks cannot be modified');

  const status = normalizeTaskStatus(data.status);
  if (status === 'OVERDUE') throw new Error('Overdue is calculated from due date and cannot be saved manually');

  const updated = await prisma.task.update({
    where: { id: taskId },
    data: {
      ...(data.title !== undefined && { title: data.title }),
      ...(data.description !== undefined && { description: data.description }),
      ...(data.dueDate !== undefined && { dueDate: data.dueDate ? new Date(data.dueDate) : null }),
      ...(data.priority !== undefined && { priority: normalizeTaskPriority(data.priority) }),
      ...(status !== undefined && { status }),
      ...(status === 'COMPLETED' && { completedAt: new Date(), completedById: userId }),
      ...(status && status !== 'COMPLETED' && { completedAt: null, completedById: null }),
    },
    include: {
      lead: { select: { id: true, name: true, status: true } },
      client: { select: { id: true, clientNumber: true, firstName: true, lastName: true, companyName: true } },
      policy: { select: { id: true, policyNumber: true, status: true } },
      assignedTo: { select: { id: true, firstName: true, lastName: true, email: true } },
      createdBy: { select: { id: true, firstName: true, lastName: true, email: true } },
    },
  });

  return { ...updated, ...taskRelatedEntity(updated) };
}

export async function completeAgentTask(agent: Agent, userId: string, taskId: string) {
  return updateAgentTask(agent, userId, taskId, { status: 'COMPLETED' });
}

export async function listAgentCommissions(agent: Agent, query: Record<string, unknown>) {
  const page = Math.max(1, parseInt(String(query.page ?? 1), 10) || 1);
  const limit = Math.min(100, parseInt(String(query.limit ?? 20), 10) || 20);
  const requestedStatus = query.status ? String(query.status).toUpperCase() : undefined;
  const status = requestedStatus && agentCommissionStatuses.includes(requestedStatus as AgentCommissionStatus)
    ? requestedStatus as AgentCommissionStatus
    : undefined;
  const client = String(query.client ?? '').trim();
  const policy = String(query.policy ?? '').trim();
  const from = dateFrom(query.from);
  const to = dateFrom(query.to);
  const sort = String(query.sort ?? 'earned-desc');

  const filters: Prisma.AgentCommissionWhereInput[] = [{ agentId: agent.id }];
  if (status) filters.push({ status });
  if (from || to) {
    filters.push({
      earnedAt: {
        ...(from && { gte: startOfDay(from) }),
        ...(to && { lte: endOfDay(to) }),
      },
    });
  }
  if (client) {
    filters.push({
      client: {
        is: {
          OR: [
            { clientNumber: { contains: client, mode: 'insensitive' } },
            { firstName: { contains: client, mode: 'insensitive' } },
            { lastName: { contains: client, mode: 'insensitive' } },
            { companyName: { contains: client, mode: 'insensitive' } },
          ],
        },
      },
    });
  }
  if (policy) {
    filters.push({
      policy: {
        is: {
          OR: [
            { policyNumber: { contains: policy, mode: 'insensitive' } },
            { insurerPolicyNumber: { contains: policy, mode: 'insensitive' } },
          ],
        },
      },
    });
  }

  const where: Prisma.AgentCommissionWhereInput = { AND: filters };
  const orderBy: Prisma.AgentCommissionOrderByWithRelationInput =
    sort === 'earned-asc' ? { earnedAt: 'asc' } :
    sort === 'amount-desc' ? { commissionAmount: 'desc' } :
    sort === 'paid-desc' ? { paidAt: 'desc' } :
    { earnedAt: 'desc' };

  const now = new Date();
  const monthStart = startOfMonth(now);

  const [commissions, total, pending, approved, payable, paidThisMonth, totalPaid] = await Promise.all([
    prisma.agentCommission.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy,
      include: {
        policy: {
          select: {
            id: true,
            policyNumber: true,
            status: true,
            totalPremium: true,
            startDate: true,
            endDate: true,
            insurer: { select: { id: true, name: true, shortName: true } },
            product: { select: { id: true, name: true, code: true } },
          },
        },
        client: { select: { id: true, clientNumber: true, firstName: true, lastName: true, companyName: true, phone: true, email: true } },
        lead: { select: { id: true, name: true, status: true, stage: true } },
        commissionRule: { select: { id: true, name: true, calculationType: true, percentageRate: true, fixedAmount: true } },
      },
    }),
    prisma.agentCommission.count({ where }),
    prisma.agentCommission.aggregate({ where: { agentId: agent.id, status: 'PENDING' }, _sum: { commissionAmount: true }, _count: { _all: true } }),
    prisma.agentCommission.aggregate({ where: { agentId: agent.id, status: 'APPROVED' }, _sum: { commissionAmount: true }, _count: { _all: true } }),
    prisma.agentCommission.aggregate({ where: { agentId: agent.id, status: 'PAYABLE' }, _sum: { commissionAmount: true }, _count: { _all: true } }),
    prisma.agentCommission.aggregate({ where: { agentId: agent.id, status: 'PAID', paidAt: { gte: monthStart, lte: now } }, _sum: { commissionAmount: true }, _count: { _all: true } }),
    prisma.agentCommission.aggregate({ where: { agentId: agent.id, status: 'PAID' }, _sum: { commissionAmount: true }, _count: { _all: true } }),
  ]);

  return {
    commissions: commissions.map((commission) => ({
      ...commission,
      premiumAmount: decimalNumber(commission.premiumAmount),
      commissionRate: decimalNumber(commission.commissionRate),
      commissionAmount: decimalNumber(commission.commissionAmount),
      policy: commission.policy ? { ...commission.policy, totalPremium: decimalNumber(commission.policy.totalPremium) } : null,
    })),
    total,
    page,
    limit,
    summary: {
      pending: { count: groupCount(pending._count), amount: decimalNumber(pending._sum.commissionAmount) },
      approved: { count: groupCount(approved._count), amount: decimalNumber(approved._sum.commissionAmount) },
      payable: { count: groupCount(payable._count), amount: decimalNumber(payable._sum.commissionAmount) },
      paidThisMonth: { count: groupCount(paidThisMonth._count), amount: decimalNumber(paidThisMonth._sum.commissionAmount) },
      totalPaid: { count: groupCount(totalPaid._count), amount: decimalNumber(totalPaid._sum.commissionAmount) },
    },
  };
}

export async function getAgentCommission(agent: Agent, commissionId: string) {
  const commission = await prisma.agentCommission.findFirst({
    where: { id: commissionId, agentId: agent.id },
    include: {
      policy: {
        include: {
          insurer: { select: { id: true, name: true, shortName: true } },
          product: { select: { id: true, name: true, code: true, category: true } },
        },
      },
      client: true,
      lead: true,
      agent: { select: { id: true, agentNumber: true, firstName: true, lastName: true, companyName: true } },
      commissionRule: true,
    },
  });
  if (!commission) throw new Error('Commission not found');
  return {
    ...commission,
    premiumAmount: decimalNumber(commission.premiumAmount),
    commissionRate: decimalNumber(commission.commissionRate),
    commissionAmount: decimalNumber(commission.commissionAmount),
    policy: commission.policy
      ? {
          ...commission.policy,
          basePremium: decimalNumber(commission.policy.basePremium),
          totalPremium: decimalNumber(commission.policy.totalPremium),
          outstandingAmount: decimalNumber(commission.policy.outstandingAmount),
        }
      : null,
    commissionRule: commission.commissionRule
      ? {
          ...commission.commissionRule,
          fixedAmount: decimalNumber(commission.commissionRule.fixedAmount),
          percentageRate: decimalNumber(commission.commissionRule.percentageRate),
          minPremium: decimalNumber(commission.commissionRule.minPremium),
          maxPremium: decimalNumber(commission.commissionRule.maxPremium),
        }
      : null,
  };
}

export async function convertAgentLead(agent: Agent, userId: string, leadId: string, data: ConvertAgentLeadInput) {
  const lead = await prisma.lead.findFirst({
    where: { id: leadId, ...leadScope(agent, userId) },
    include: {
      proposals: {
        where: { status: 'ACCEPTED' },
        orderBy: { acceptedAt: 'desc' },
        include: { product: true, insurer: true },
      },
      dependents: { where: { deletedAt: null } },
    },
  });
  if (!lead) throw new Error('Lead not found');
  if (lead.convertedToClientId) throw new Error('Lead already converted');

  const acceptedProposal = data.policy?.acceptedProposalId
    ? lead.proposals.find((proposal) => proposal.id === data.policy?.acceptedProposalId)
    : lead.proposals[0] ?? null;
  const readyForOnboarding = lead.stage === 'READY_FOR_ONBOARDING' || Boolean(acceptedProposal);
  if (!readyForOnboarding) throw new Error('Lead must be ready for onboarding or have an accepted proposal before conversion');

  const createPolicy = data.policy?.createPolicy === true;
  if (createPolicy && lead.proposals.length > 0 && !acceptedProposal) {
    throw new Error('Select an accepted proposal before creating a draft policy');
  }

  const clientType = data.client.clientType ?? lead.leadType ?? 'INDIVIDUAL';
  const policyProductId = data.policy?.productId ?? acceptedProposal?.productId ?? null;
  const policyInsurerId = data.policy?.insurerId ?? acceptedProposal?.insurerId ?? null;
  const policyPremium = data.policy?.premiumAmount ?? decimalNumber(acceptedProposal?.premiumAmount) ?? decimalNumber(lead.expectedPremium);
  if (createPolicy && (!policyProductId || !policyInsurerId || !policyPremium)) {
    throw new Error('Policy draft requires product, insurer, and premium amount');
  }

  const now = new Date();
  const result = await prisma.$transaction(async (tx) => {
    const clientNumber = await nextAgentClientNumber(tx);
    const client = await tx.client.create({
      data: {
        clientNumber,
        type: clientType as any,
        firstName: clientType === 'INDIVIDUAL' ? data.client.firstName ?? splitName(lead.name).firstName : data.client.firstName ?? null,
        lastName: clientType === 'INDIVIDUAL' ? data.client.lastName ?? splitName(lead.name).lastName : data.client.lastName ?? null,
        companyName: clientType !== 'INDIVIDUAL' ? data.client.companyName ?? lead.companyName ?? lead.name : data.client.companyName ?? null,
        email: data.client.email ?? lead.email,
        phone: data.client.phone ?? lead.phone,
        nationalId: data.client.nationalId ?? null,
        registrationNumber: data.client.registrationNumber ?? null,
        kraPin: data.client.kraPin ?? null,
        physicalAddress: data.client.address ?? lead.sourceDetail ?? null,
        county: data.client.county ?? null,
        relationshipManagerId: userId,
        agentId: lead.agentId,
        convertedFromLeadId: lead.id,
        onboardedByUserId: userId,
        onboardedAt: now,
        createdById: userId,
      },
    });

    const dependents = data.dependents?.length
      ? await Promise.all(data.dependents.map((dependent) => {
        const names = splitName(dependent.fullName);
        return tx.clientDependent.create({
          data: {
            clientId: client.id,
            firstName: names.firstName,
            lastName: names.lastName,
            relationship: dependent.relationship,
            dateOfBirth: dependent.dateOfBirth ? new Date(dependent.dateOfBirth) : null,
            gender: dependent.gender ?? null,
            nationalId: dependent.nationalId ?? dependent.birthCertificate ?? null,
            notes: dependent.birthCertificate ? `Birth certificate: ${dependent.birthCertificate}` : null,
          },
        });
      }))
      : await Promise.all(lead.dependents.map((dependent) => tx.clientDependent.create({
        data: {
          clientId: client.id,
          firstName: dependent.firstName,
          lastName: dependent.lastName,
          relationship: dependent.relationship,
          dateOfBirth: dependent.dateOfBirth,
          gender: dependent.gender,
          nationalId: dependent.nationalId,
          passportNumber: dependent.passportNumber,
          notes: dependent.notes,
        },
      })));

    let nextOfKin = null;
    if (data.client.nextOfKinName || data.client.nextOfKinPhone) {
      nextOfKin = await tx.clientContact.create({
        data: {
          clientId: client.id,
          name: data.client.nextOfKinName || 'Next of kin',
          phone: data.client.nextOfKinPhone ?? null,
          role: 'NEXT_OF_KIN',
          isPrimary: false,
        },
      });
    }

    let policy = null;
    if (createPolicy && policyProductId && policyInsurerId && policyPremium) {
      const { startDate, endDate } = resolvePolicyDates(data.policy?.startDate, data.policy?.endDate);
      const policyNumber = await generatePolicyNumber();
      policy = await tx.policy.create({
        data: {
          policyNumber,
          clientId: client.id,
          productId: policyProductId,
          insurerId: policyInsurerId,
          agentId: lead.agentId,
          sourceLeadId: lead.id,
          convertedFromProposalId: acceptedProposal?.id ?? null,
          onboardedByUserId: userId,
          startDate,
          endDate,
          basePremium: new Decimal(policyPremium),
          trainingLevy: new Decimal(0),
          pcifLevy: new Decimal(0),
          stampDuty: new Decimal(0),
          policyFee: new Decimal(0),
          totalPremium: new Decimal(policyPremium),
          outstandingAmount: new Decimal(policyPremium),
          totalPremiumAmount: new Decimal(policyPremium),
          outstandingPremiumAmount: new Decimal(policyPremium),
          paymentFrequency: 'ANNUAL',
          status: 'DRAFT',
          underwritingStatus: 'PENDING',
          notes: [data.policy?.coverType ? `Cover type: ${data.policy.coverType}` : null, data.policy?.notes].filter(Boolean).join('\n') || null,
          createdById: userId,
        },
        include: {
          client: { select: { id: true, clientNumber: true, firstName: true, lastName: true, companyName: true } },
          product: { select: { id: true, name: true, code: true } },
          insurer: { select: { id: true, name: true, shortName: true } },
        },
      });

      await tx.policyEvent.create({
        data: {
          policyId: policy.id,
          eventType: 'AGENT_ONBOARDING_DRAFT_CREATED',
          description: `Draft policy ${policy.policyNumber} created from lead conversion`,
          metadata: { leadId: lead.id, proposalId: acceptedProposal?.id ?? null },
          userId,
        },
      });
    }

    if (data.documents?.length) {
      await tx.document.createMany({
        data: data.documents.map((document) => ({
          entityType: 'CLIENT',
          entityId: client.id,
          clientId: client.id,
          policyId: policy?.id ?? null,
          type: document.type,
          documentType: document.type,
          category: 'ONBOARDING',
          name: document.name,
          title: document.name,
          fileUrl: document.fileUrl,
          fileName: document.name,
          originalFileName: document.name,
          fileSize: document.fileSize ?? 0,
          mimeType: document.mimeType ?? 'application/octet-stream',
          sourceModule: 'AGENT_PORTAL',
          relatedEntityType: 'LEAD',
          relatedEntityId: lead.id,
          uploadedById: userId,
          createdById: userId,
          tags: ['agent-onboarding'],
          metadata: { leadId: lead.id, policyId: policy?.id ?? null },
        })),
      });
    }

    const updatedLead = await tx.lead.update({
      where: { id: lead.id },
      data: {
        status: 'WON',
        stage: 'CONVERTED',
        convertedToClientId: client.id,
        convertedAt: now,
        proposalStatus: acceptedProposal ? 'ACCEPTED' : lead.proposalStatus,
      },
    });

    await tx.leadActivity.create({
      data: {
        leadId: lead.id,
        type: 'CONVERSION',
        description: `Lead converted to client ${client.clientNumber}${policy ? ` with draft policy ${policy.policyNumber}` : ''}`,
        userId,
        metadata: {
          clientId: client.id,
          policyId: policy?.id ?? null,
          acceptedProposalId: acceptedProposal?.id ?? null,
          dependentsCreated: dependents.length,
          nextOfKinId: nextOfKin?.id ?? null,
        },
      },
    });

    return { lead: updatedLead, client, dependents, policy, nextOfKin };
  });

  return {
    ...result,
    acceptedProposal: acceptedProposal ? formatProposal(acceptedProposal) : null,
  };
}
