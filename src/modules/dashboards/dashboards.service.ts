import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database';
import { AuthUser } from '../../types/express';

type DashboardRole =
  | 'admin'
  | 'operations'
  | 'underwriting'
  | 'finance'
  | 'claims'
  | 'support'
  | 'sales'
  | 'agents'
  | 'branch-manager';

function number(value: unknown): number {
  if (value == null) return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function groupCount(value: unknown): number {
  if (typeof value === 'number') return value;
  if (value && typeof value === 'object') {
    const maybeCount = (value as Record<string, unknown>)._all ?? Object.values(value as Record<string, unknown>)[0];
    return number(maybeCount);
  }
  return number(value);
}

function daysFromNow(days: number): Date {
  return new Date(Date.now() + days * 86400000);
}

function startOfMonth(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

function titleCase(value: string): string {
  return value
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

async function statusCounts<T extends string>(
  model: { groupBy: (args: any) => Promise<Array<Record<string, unknown>>> },
  by: string,
  where: Record<string, unknown> = {},
): Promise<Array<{ label: string; value: number }>> {
  const rows = await model.groupBy({ by: [by], where, _count: true });
  return rows.map((row) => ({
    label: String(row[by]).replace(/_/g, ' '),
    value: groupCount(row._count),
  }));
}

async function commonQueues() {
  const now = new Date();
  const soon = daysFromNow(14);

  const [overdueTasks, renewals, activationBlocked, unverifiedDirectPayments] = await Promise.all([
    prisma.task.findMany({
      where: { status: { notIn: ['COMPLETED', 'CANCELLED'] }, dueDate: { lt: now } },
      orderBy: [{ priority: 'desc' }, { dueDate: 'asc' }],
      take: 8,
      include: {
        client: { select: { clientNumber: true, firstName: true, lastName: true, companyName: true } },
        policy: { select: { policyNumber: true, status: true } },
        claim: { select: { claimNumber: true, status: true } },
        agent: { select: { agentNumber: true, firstName: true, lastName: true, companyName: true } },
      },
    }),
    prisma.policy.findMany({
      where: { deletedAt: null, status: 'ACTIVE', endDate: { gte: now, lte: soon } },
      orderBy: { endDate: 'asc' },
      take: 8,
      include: {
        client: { select: { clientNumber: true, firstName: true, lastName: true, companyName: true } },
        insurer: { select: { name: true, shortName: true } },
      },
    }),
    prisma.policy.findMany({
      where: { deletedAt: null, status: { in: ['DRAFT', 'PENDING_PAYMENT', 'PENDING_UNDERWRITING'] } },
      orderBy: { updatedAt: 'asc' },
      take: 8,
      include: {
        client: { select: { clientNumber: true, firstName: true, lastName: true, companyName: true } },
        insurer: { select: { name: true, shortName: true } },
      },
    }),
    prisma.directInsurerPayment.findMany({
      where: { deletedAt: null, verificationStatus: { not: 'VERIFIED' } },
      orderBy: { paymentDate: 'asc' },
      take: 8,
      include: {
        policy: { select: { policyNumber: true } },
        client: { select: { clientNumber: true, firstName: true, lastName: true, companyName: true } },
        insurer: { select: { name: true, shortName: true } },
      },
    }),
  ]);

  return { overdueTasks, renewals, activationBlocked, unverifiedDirectPayments };
}

async function adminDashboard() {
  const [users, clients, policies, premium, claims, openTasks, failedAccounting] = await Promise.all([
    prisma.user.count({ where: { deletedAt: null, isActive: true } }),
    prisma.client.count({ where: { deletedAt: null } }),
    prisma.policy.count({ where: { deletedAt: null } }),
    prisma.policy.aggregate({ where: { deletedAt: null }, _sum: { totalPremium: true, outstandingAmount: true } }),
    prisma.claim.count({ where: { deletedAt: null, status: { notIn: ['CLOSED', 'VOIDED', 'WITHDRAWN'] } } }),
    prisma.task.count({ where: { status: { notIn: ['COMPLETED', 'CANCELLED'] } } }),
    Promise.all([
      prisma.payment.count({ where: { deletedAt: null, accountingPostedStatus: 'FAILED' } }),
      prisma.policy.count({ where: { deletedAt: null, accountingPostedStatus: 'FAILED' } }),
      prisma.directInsurerPayment.count({ where: { deletedAt: null, accountingPostedStatus: 'FAILED' } }),
      prisma.commissionEntry.count({ where: { accountingPostedStatus: 'FAILED' } }),
    ]).then((counts) => counts.reduce((sum, count) => sum + count, 0)).catch(() => 0),
  ]);

  return {
    role: 'admin',
    title: 'Admin Control Dashboard',
    subtitle: 'System health, operating load, and governance queues',
    kpis: [
      { label: 'Active users', value: users, tone: 'blue' },
      { label: 'Clients', value: clients, tone: 'emerald' },
      { label: 'Policies', value: policies, tone: 'purple' },
      { label: 'Open claims', value: claims, tone: 'amber' },
      { label: 'Open tasks', value: openTasks, tone: 'rose' },
      { label: 'Premium book', value: number(premium._sum.totalPremium), format: 'money', tone: 'slate' },
      { label: 'Outstanding premium', value: number(premium._sum.outstandingAmount), format: 'money', tone: 'rose' },
      { label: 'Failed postings', value: failedAccounting, tone: failedAccounting ? 'rose' : 'emerald' },
    ],
    charts: {
      policyStatus: await statusCounts(prisma.policy as any, 'status', { deletedAt: null }),
      claimStatus: await statusCounts(prisma.claim as any, 'status', { deletedAt: null }),
    },
    queues: await commonQueues(),
  };
}

async function salesDashboard(user: AuthUser) {
  const leadWhere: Prisma.LeadWhereInput = { deletedAt: null };
  const ownLeadWhere: Prisma.LeadWhereInput = { ...leadWhere, assignedToId: user.id };
  const [openLeads, hotLeads, wonThisMonth, expected, followUps, recentLeads] = await Promise.all([
    prisma.lead.count({ where: { ...leadWhere, status: { notIn: ['WON', 'LOST', 'DORMANT'] } } }),
    prisma.lead.count({ where: { ...leadWhere, priority: 'HOT', status: { notIn: ['WON', 'LOST'] } } }),
    prisma.lead.count({ where: { ...leadWhere, status: 'WON', convertedAt: { gte: startOfMonth() } } }),
    prisma.lead.aggregate({ where: { ...leadWhere, status: { notIn: ['LOST', 'DORMANT'] } }, _sum: { expectedPremium: true } }),
    prisma.lead.findMany({
      where: { ...ownLeadWhere, nextFollowUp: { lte: daysFromNow(7) }, status: { notIn: ['WON', 'LOST', 'DORMANT'] } },
      orderBy: { nextFollowUp: 'asc' },
      take: 10,
      include: { assignedTo: { select: { firstName: true, lastName: true } } },
    }),
    prisma.lead.findMany({
      where: leadWhere,
      orderBy: { createdAt: 'desc' },
      take: 8,
      include: { assignedTo: { select: { firstName: true, lastName: true } } },
    }),
  ]);

  return {
    role: 'sales',
    title: 'Sales Team Dashboard',
    subtitle: 'Lead velocity, follow-ups, conversion work, and premium pipeline',
    kpis: [
      { label: 'Open leads', value: openLeads, tone: 'blue' },
      { label: 'Hot leads', value: hotLeads, tone: 'rose' },
      { label: 'Won this month', value: wonThisMonth, tone: 'emerald' },
      { label: 'Expected premium', value: number(expected._sum.expectedPremium), format: 'money', tone: 'purple' },
    ],
    charts: {
      leadStatus: await statusCounts(prisma.lead as any, 'status', leadWhere),
    },
    queues: { followUps, recentLeads },
  };
}

async function operationsDashboard() {
  const [onboarding, pendingPolicies, overdueTasks, documentsPending] = await Promise.all([
    prisma.onboardingCase.count({ where: { status: { in: ['DRAFT', 'SUBMITTED', 'IN_REVIEW'] as any } } }),
    prisma.policy.count({ where: { deletedAt: null, status: { in: ['DRAFT', 'PENDING_PAYMENT', 'PENDING_UNDERWRITING'] } } }),
    prisma.task.count({ where: { status: { notIn: ['COMPLETED', 'CANCELLED'] }, dueDate: { lt: new Date() } } }),
    prisma.document.count({ where: { status: { in: ['PENDING', 'UPLOADED'] as any } } }).catch(() => 0),
  ]);
  const queues = await commonQueues();
  return {
    role: 'operations',
    title: 'Operations Dashboard',
    subtitle: 'Onboarding, activation, document, and cross-team execution queues',
    kpis: [
      { label: 'Onboarding in progress', value: onboarding, tone: 'blue' },
      { label: 'Activation queue', value: pendingPolicies, tone: 'amber' },
      { label: 'Overdue tasks', value: overdueTasks, tone: 'rose' },
      { label: 'Documents pending', value: documentsPending, tone: 'purple' },
    ],
    charts: {
      onboardingStatus: await statusCounts(prisma.onboardingCase as any, 'status'),
      taskStatus: await statusCounts(prisma.task as any, 'status'),
    },
    queues,
  };
}

async function underwritingDashboard() {
  const [pending, missingNumbers, schedulesMissing, referred] = await Promise.all([
    prisma.policy.count({ where: { deletedAt: null, status: 'PENDING_UNDERWRITING' } }),
    prisma.policy.count({ where: { deletedAt: null, status: { in: ['DRAFT', 'PENDING_PAYMENT', 'PENDING_UNDERWRITING'] }, insurerPolicyNumber: null } }),
    prisma.policy.count({
      where: {
        deletedAt: null,
        status: { in: ['DRAFT', 'PENDING_PAYMENT', 'PENDING_UNDERWRITING'] },
        documents: { none: { type: 'POLICY_SCHEDULE' } },
      },
    }),
    prisma.policy.count({ where: { deletedAt: null, underwritingStatus: 'REFERRED' } }),
  ]);
  const queues = await commonQueues();
  return {
    role: 'underwriting',
    title: 'Underwriting Dashboard',
    subtitle: 'Policy readiness, insurer references, schedules, and approval blockers',
    kpis: [
      { label: 'Pending underwriting', value: pending, tone: 'amber' },
      { label: 'Missing insurer numbers', value: missingNumbers, tone: 'rose' },
      { label: 'Missing schedules', value: schedulesMissing, tone: 'purple' },
      { label: 'Referred cases', value: referred, tone: 'blue' },
    ],
    charts: { underwritingStatus: await statusCounts(prisma.policy as any, 'underwritingStatus', { deletedAt: null }) },
    queues: { activationBlocked: queues.activationBlocked, renewals: queues.renewals },
  };
}

async function financeDashboard() {
  const [paymentsPending, outstanding, unverifiedDirect, commissionReceivable, remittances] = await Promise.all([
    prisma.payment.count({ where: { deletedAt: null, status: { in: ['PENDING', 'VERIFIED', 'ALLOCATED'] } } }),
    prisma.policy.aggregate({ where: { deletedAt: null, outstandingAmount: { gt: 0 } }, _sum: { outstandingAmount: true }, _count: true }),
    prisma.directInsurerPayment.count({ where: { deletedAt: null, verificationStatus: { not: 'VERIFIED' } } }),
    prisma.commissionEntry.aggregate({ where: { insurerCommissionStatus: { in: ['RECEIVABLE', 'PARTIALLY_RECEIVED', 'OVERDUE'] } }, _sum: { commissionReceivableAmount: true } }),
    prisma.insurerRemittance.count({ where: { status: { in: ['DRAFT', 'APPROVED', 'PARTIALLY_PAID', 'OVERDUE'] as any } } }).catch(() => 0),
  ]);
  const queues = await commonQueues();
  return {
    role: 'finance',
    title: 'Finance Dashboard',
    subtitle: 'Cash collection, allocation, remittance, commission, and reconciliation workload',
    kpis: [
      { label: 'Payments needing action', value: paymentsPending, tone: 'amber' },
      { label: 'Outstanding policies', value: outstanding._count, tone: 'rose' },
      { label: 'Outstanding premium', value: number(outstanding._sum.outstandingAmount), format: 'money', tone: 'rose' },
      { label: 'Direct proofs to verify', value: unverifiedDirect, tone: 'purple' },
      { label: 'Commission receivable', value: number(commissionReceivable._sum.commissionReceivableAmount), format: 'money', tone: 'emerald' },
      { label: 'Remittance queue', value: remittances, tone: 'blue' },
    ],
    charts: {
      paymentStatus: await statusCounts(prisma.payment as any, 'status', { deletedAt: null }),
      commissionStatus: await statusCounts(prisma.commissionEntry as any, 'status'),
    },
    queues: { unverifiedDirectPayments: queues.unverifiedDirectPayments, activationBlocked: queues.activationBlocked },
  };
}

async function claimsDashboard() {
  const [open, urgent, fraud, settlementsDue, amount] = await Promise.all([
    prisma.claim.count({ where: { deletedAt: null, status: { notIn: ['CLOSED', 'VOIDED', 'WITHDRAWN'] } } }),
    prisma.claim.count({ where: { deletedAt: null, priority: { in: ['HIGH', 'URGENT'] as any }, status: { notIn: ['CLOSED', 'VOIDED', 'WITHDRAWN'] } } }),
    prisma.claim.count({ where: { deletedAt: null, fraudFlag: true, status: { notIn: ['CLOSED', 'VOIDED', 'WITHDRAWN'] } } }),
    prisma.claimSettlement.count({ where: { status: { in: ['EXPECTED', 'APPROVED'] as any }, expectedPaymentDate: { lte: daysFromNow(14) } } }).catch(() => 0),
    prisma.claim.aggregate({ where: { deletedAt: null, status: { notIn: ['CLOSED', 'VOIDED', 'WITHDRAWN'] } }, _sum: { amountClaimed: true, amountApproved: true } }),
  ]);
  const claims = await prisma.claim.findMany({
    where: { deletedAt: null, status: { notIn: ['CLOSED', 'VOIDED', 'WITHDRAWN'] } },
    orderBy: [{ priority: 'desc' }, { dateReported: 'asc' }],
    take: 10,
    include: { client: { select: { clientNumber: true, firstName: true, lastName: true, companyName: true } }, policy: { select: { policyNumber: true } } },
  });
  return {
    role: 'claims',
    title: 'Claims Team Dashboard',
    subtitle: 'Claim workload, SLA exposure, settlement follow-up, and high-risk claims',
    kpis: [
      { label: 'Open claims', value: open, tone: 'blue' },
      { label: 'High priority', value: urgent, tone: 'rose' },
      { label: 'Fraud flagged', value: fraud, tone: 'amber' },
      { label: 'Settlements due', value: settlementsDue, tone: 'purple' },
      { label: 'Claimed exposure', value: number(amount._sum.amountClaimed), format: 'money', tone: 'slate' },
      { label: 'Approved exposure', value: number(amount._sum.amountApproved), format: 'money', tone: 'emerald' },
    ],
    charts: { claimStatus: await statusCounts(prisma.claim as any, 'status', { deletedAt: null }) },
    queues: { claims },
  };
}

async function supportDashboard() {
  const [openTasks, overdueTasks, failedMessages, openClaims, recentClients] = await Promise.all([
    prisma.task.count({ where: { status: { notIn: ['COMPLETED', 'CANCELLED'] } } }),
    prisma.task.count({ where: { status: { notIn: ['COMPLETED', 'CANCELLED'] }, dueDate: { lt: new Date() } } }),
    prisma.messageLog.count({ where: { status: { in: ['FAILED', 'BOUNCED', 'PARTIALLY_FAILED'] as any } } }).catch(() => 0),
    prisma.claim.count({ where: { deletedAt: null, status: { notIn: ['CLOSED', 'VOIDED', 'WITHDRAWN'] } } }),
    prisma.client.findMany({ where: { deletedAt: null }, orderBy: { createdAt: 'desc' }, take: 8 }),
  ]);
  const queues = await commonQueues();
  return {
    role: 'support',
    title: 'Customer Support Dashboard',
    subtitle: 'Client service workload, escalations, failed communications, and service queues',
    kpis: [
      { label: 'Open tasks', value: openTasks, tone: 'blue' },
      { label: 'Overdue service tasks', value: overdueTasks, tone: 'rose' },
      { label: 'Failed communications', value: failedMessages, tone: 'amber' },
      { label: 'Open claims visibility', value: openClaims, tone: 'purple' },
    ],
    charts: { taskStatus: await statusCounts(prisma.task as any, 'status') },
    queues: { overdueTasks: queues.overdueTasks, recentClients },
  };
}

async function agentsDashboard() {
  const [active, suspended, premium, commissions, topAgents] = await Promise.all([
    prisma.agent.count({ where: { deletedAt: null, status: 'ACTIVE' } }),
    prisma.agent.count({ where: { deletedAt: null, status: 'SUSPENDED' } }),
    prisma.policy.aggregate({ where: { deletedAt: null, agentId: { not: null } }, _sum: { totalPremium: true }, _count: true }),
    prisma.commissionEntry.aggregate({ where: { agentId: { not: null }, status: { in: ['CALCULATED', 'PENDING_APPROVAL', 'APPROVED', 'PAYABLE', 'HELD'] as any } }, _sum: { netCommission: true } }),
    prisma.agent.findMany({
      where: { deletedAt: null },
      include: { _count: { select: { policies: true, commissionEntries: true } }, commissionEntries: { take: 10 } },
      orderBy: { createdAt: 'desc' },
      take: 10,
    }),
  ]);
  return {
    role: 'agents',
    title: 'Agent Management Dashboard',
    subtitle: 'Agent productivity, compliance readiness, commission exposure, and team follow-up',
    kpis: [
      { label: 'Active agents', value: active, tone: 'emerald' },
      { label: 'Suspended agents', value: suspended, tone: 'rose' },
      { label: 'Agent policies', value: premium._count, tone: 'blue' },
      { label: 'Agent premium', value: number(premium._sum.totalPremium), format: 'money', tone: 'purple' },
      { label: 'Pending commission', value: number(commissions._sum.netCommission), format: 'money', tone: 'amber' },
    ],
    charts: { agentStatus: await statusCounts(prisma.agent as any, 'status', { deletedAt: null }) },
    queues: { topAgents },
  };
}

async function branchManagerDashboard(user: AuthUser) {
  const directReports = await prisma.agent.findMany({
    where: {
      deletedAt: null,
      OR: [{ manager: { userId: user.id } }, { managerId: null }],
    },
    include: { _count: { select: { policies: true, commissionEntries: true, tasks: true } } },
    take: 20,
  });
  const ids = directReports.map((agent) => agent.id);
  const [premium, commissions, openTasks] = await Promise.all([
    prisma.policy.aggregate({ where: { deletedAt: null, agentId: { in: ids } }, _sum: { totalPremium: true }, _count: true }),
    prisma.commissionEntry.aggregate({ where: { agentId: { in: ids } }, _sum: { netCommission: true } }),
    prisma.task.count({ where: { agentId: { in: ids }, status: { notIn: ['COMPLETED', 'CANCELLED'] } } }),
  ]);
  return {
    role: 'branch-manager',
    title: 'Branch Manager Dashboard',
    subtitle: 'Team production, pending actions, renewals, and commission workload',
    kpis: [
      { label: 'Managed agents', value: directReports.length, tone: 'blue' },
      { label: 'Team policies', value: premium._count, tone: 'emerald' },
      { label: 'Team premium', value: number(premium._sum.totalPremium), format: 'money', tone: 'purple' },
      { label: 'Team commission', value: number(commissions._sum.netCommission), format: 'money', tone: 'amber' },
      { label: 'Open team tasks', value: openTasks, tone: 'rose' },
    ],
    charts: { agentStatus: await statusCounts(prisma.agent as any, 'status', { deletedAt: null, id: { in: ids } }) },
    queues: { directReports },
  };
}

export async function getStaffDashboard(role: DashboardRole, user: AuthUser) {
  switch (role) {
    case 'admin':
      return adminDashboard();
    case 'operations':
      return operationsDashboard();
    case 'underwriting':
      return underwritingDashboard();
    case 'finance':
      return financeDashboard();
    case 'claims':
      return claimsDashboard();
    case 'support':
      return supportDashboard();
    case 'sales':
      return salesDashboard(user);
    case 'agents':
      return agentsDashboard();
    case 'branch-manager':
      return branchManagerDashboard(user);
    default:
      return { role, title: `${titleCase(role)} Dashboard`, subtitle: 'Operational dashboard', kpis: [], charts: {}, queues: {} };
  }
}

export async function listDashboardRoles(user: AuthUser) {
  const roleNames = new Set(user.roles);
  return [
    { key: 'admin', label: 'Admin', available: user.permissions.includes('users.read') || roleNames.has('Admin') || roleNames.has('SuperAdmin') },
    { key: 'operations', label: 'Operations', available: user.permissions.includes('onboarding.read') || user.permissions.includes('policies.read') },
    { key: 'underwriting', label: 'Underwriting', available: user.permissions.includes('policies.read') },
    { key: 'finance', label: 'Finance', available: user.permissions.includes('accounting.dashboard.read') || user.permissions.includes('payments.read') },
    { key: 'claims', label: 'Claims', available: user.permissions.includes('claims.read') },
    { key: 'support', label: 'Customer Support', available: user.permissions.includes('clients.read') || user.permissions.includes('tasks.read') },
    { key: 'sales', label: 'Sales', available: user.permissions.includes('leads.read') },
    { key: 'agents', label: 'Agent Management', available: user.permissions.includes('agents.read') },
    { key: 'branch-manager', label: 'Branch Manager', available: user.permissions.includes('agents.read') || roleNames.has('OpsManager') },
  ].filter((item) => item.available);
}
