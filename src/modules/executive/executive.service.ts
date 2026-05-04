import { prisma } from '../../config/database';

type ExecutiveFilters = {
  dateFrom: Date;
  dateTo: Date;
  insurerId?: string;
  agentId?: string;
  insuranceClass?: string;
};

const OPEN_CLAIM_STATUSES = [
  'REPORTED',
  'REGISTERED',
  'DOCUMENTS_PENDING',
  'DOCUMENTS_COMPLETE',
  'SUBMITTED_TO_INSURER',
  'UNDER_REVIEW',
  'ADDITIONAL_INFO_REQUESTED',
  'ASSESSED',
  'APPROVED',
  'PARTIALLY_APPROVED',
  'APPEAL',
  'SETTLEMENT_PENDING',
  'PARTIALLY_SETTLED',
];

const FINAL_CLAIM_STATUSES = ['SETTLED', 'CLOSED', 'WITHDRAWN', 'VOIDED', 'REJECTED'];
const ACTIVE_POLICY_STATUSES = ['ACTIVE', 'PENDING_PAYMENT', 'PENDING_UNDERWRITING'];
const ACTIVE_PAYMENT_STATUSES = ['VERIFIED', 'ALLOCATED', 'COMPLETED'];
const RECEIVABLE_COMMISSION_STATUSES = ['RECEIVABLE', 'PARTIALLY_RECEIVED', 'OVERDUE'];
const PAYABLE_REMITTANCE_STATUSES = ['DRAFT', 'APPROVED', 'PARTIALLY_PAID'];

function asNumber(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function startOfMonth(date = new Date()): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function monthLabel(key: string): string {
  const [year, month] = key.split('-').map(Number);
  return new Date(year, month - 1, 1).toLocaleString('en-US', { month: 'short', year: '2-digit' });
}

function buildMonthlySeries(dateFrom: Date, dateTo: Date) {
  const cursor = new Date(dateFrom.getFullYear(), dateFrom.getMonth(), 1);
  const end = new Date(dateTo.getFullYear(), dateTo.getMonth(), 1);
  const rows = new Map<string, any>();

  while (cursor <= end) {
    const key = monthKey(cursor);
    rows.set(key, {
      key,
      month: monthLabel(key),
      premium: 0,
      collected: 0,
      directToInsurer: 0,
      commissionReceivable: 0,
      commissionReceived: 0,
      clients: 0,
      leads: 0,
      claims: 0,
    });
    cursor.setMonth(cursor.getMonth() + 1);
  }

  return rows;
}

function selectedPolicyWhere(filters: ExecutiveFilters): any {
  return {
    deletedAt: null,
    ...(filters.insurerId && { insurerId: filters.insurerId }),
    ...(filters.agentId && { agentId: filters.agentId }),
    ...(filters.insuranceClass && { product: { insuranceClass: filters.insuranceClass } }),
  };
}

function policyDateWhere(filters: ExecutiveFilters): any {
  return {
    ...selectedPolicyWhere(filters),
    createdAt: { gte: filters.dateFrom, lte: filters.dateTo },
  };
}

function paymentWhere(filters: ExecutiveFilters): any {
  const policyFilter = selectedPolicyWhere(filters);
  const hasPolicyDimension = Boolean(filters.insurerId || filters.agentId || filters.insuranceClass);
  return {
    deletedAt: null,
    status: { in: ACTIVE_PAYMENT_STATUSES },
    paymentDate: { gte: filters.dateFrom, lte: filters.dateTo },
    ...(hasPolicyDimension && {
      allocations: {
        some: {
          reversedAt: null,
          policy: policyFilter,
        },
      },
    }),
  };
}

function directPaymentWhere(filters: ExecutiveFilters): any {
  return {
    deletedAt: null,
    verificationStatus: { in: ['VERIFIED', 'PARTIALLY_VERIFIED'] },
    paymentDate: { gte: filters.dateFrom, lte: filters.dateTo },
    ...(filters.insurerId && { insurerId: filters.insurerId }),
    ...(filters.agentId && { policy: { agentId: filters.agentId } }),
    ...(filters.insuranceClass && { policy: { product: { insuranceClass: filters.insuranceClass } } }),
  };
}

function commissionWhere(filters: ExecutiveFilters): any {
  return {
    earnedDate: { gte: filters.dateFrom, lte: filters.dateTo },
    ...(filters.insurerId && { insurerId: filters.insurerId }),
    ...(filters.agentId && { agentId: filters.agentId }),
    ...(filters.insuranceClass && { product: { insuranceClass: filters.insuranceClass } }),
  };
}

function claimWhere(filters: ExecutiveFilters): any {
  return {
    deletedAt: null,
    ...(filters.insurerId && { insurerId: filters.insurerId }),
    ...(filters.agentId && { policy: { agentId: filters.agentId } }),
    ...(filters.insuranceClass && { product: { insuranceClass: filters.insuranceClass } }),
  };
}

function ageBucket(anchorDate: Date | null | undefined, now = new Date()): string {
  if (!anchorDate) return 'Unscheduled';
  const age = Math.max(0, Math.floor((now.getTime() - new Date(anchorDate).getTime()) / 86400000));
  if (age <= 30) return '0-30';
  if (age <= 60) return '31-60';
  if (age <= 90) return '61-90';
  return '90+';
}

function riskLevel(days: number, amount = 0): 'Critical' | 'High' | 'Medium' | 'Watch' {
  if (days < 0 || amount >= 1000000) return 'Critical';
  if (days <= 15 || amount >= 500000) return 'High';
  if (days <= 30 || amount >= 150000) return 'Medium';
  return 'Watch';
}

function daysBetween(a: Date, b: Date): number {
  return Math.ceil((b.getTime() - a.getTime()) / 86400000);
}

function clientName(client?: any): string {
  if (!client) return 'Unknown client';
  return client.companyName || client.tradingName || [client.firstName, client.lastName].filter(Boolean).join(' ') || client.clientNumber;
}

function agentName(agent?: any): string {
  if (!agent) return 'Unassigned';
  return agent.companyName || [agent.firstName, agent.lastName].filter(Boolean).join(' ') || agent.agentNumber;
}

export function parseExecutiveFilters(query: Record<string, unknown>): ExecutiveFilters {
  const now = new Date();
  const parsedFrom = query.dateFrom ? new Date(String(query.dateFrom)) : startOfMonth(now);
  const parsedTo = query.dateTo ? new Date(String(query.dateTo)) : now;
  const dateFrom = Number.isNaN(parsedFrom.getTime()) ? startOfMonth(now) : parsedFrom;
  const dateTo = Number.isNaN(parsedTo.getTime()) ? now : parsedTo;
  dateFrom.setHours(0, 0, 0, 0);
  dateTo.setHours(23, 59, 59, 999);

  const clean = (value: unknown) => {
    const text = String(value ?? '').trim();
    return text.length ? text : undefined;
  };

  return {
    dateFrom,
    dateTo,
    insurerId: clean(query.insurerId),
    agentId: clean(query.agentId),
    insuranceClass: clean(query.insuranceClass),
  };
}

export async function getRevenuePipeline(filters: ExecutiveFilters) {
  const [leads, onboardingCases, policies, byInsurer, byClass] = await Promise.all([
    prisma.lead.aggregate({
      where: {
        deletedAt: null,
        status: { notIn: ['WON', 'LOST'] as any },
        createdAt: { gte: filters.dateFrom, lte: filters.dateTo },
        ...(filters.agentId && { assignedTo: { agent: { id: filters.agentId } } }),
      },
      _sum: { expectedPremium: true },
      _count: true,
    }),
    prisma.onboardingCase.aggregate({
      where: {
        status: { in: ['DRAFT', 'DOCUMENTS_PENDING', 'UNDER_REVIEW', 'INFORMATION_REQUESTED', 'APPROVED'] as any },
        createdAt: { gte: filters.dateFrom, lte: filters.dateTo },
        ...(filters.insurerId && { insurerId: filters.insurerId }),
        ...(filters.insuranceClass && { product: { insuranceClass: filters.insuranceClass } }),
      } as any,
      _sum: { premiumEstimate: true },
      _count: true,
    }),
    prisma.policy.groupBy({
      by: ['status'],
      where: policyDateWhere(filters),
      _sum: { totalPremium: true, outstandingAmount: true },
      _count: true,
    }),
    prisma.policy.groupBy({
      by: ['insurerId'],
      where: policyDateWhere(filters),
      _sum: { totalPremium: true },
      _count: true,
      orderBy: { _sum: { totalPremium: 'desc' } },
      take: 8,
    }),
    prisma.policy.findMany({
      where: policyDateWhere(filters),
      select: { totalPremium: true, product: { select: { insuranceClass: true } } },
    }),
  ]);

  const insurers = await prisma.insurer.findMany({
    where: { id: { in: byInsurer.map((row) => row.insurerId) } },
    select: { id: true, name: true, shortName: true },
  });

  const byClassMap = new Map<string, { className: string; premium: number; count: number }>();
  byClass.forEach((policy) => {
    const className = policy.product?.insuranceClass ?? 'Unclassified';
    const row = byClassMap.get(className) ?? { className, premium: 0, count: 0 };
    row.premium += asNumber(policy.totalPremium);
    row.count += 1;
    byClassMap.set(className, row);
  });

  const stages = [
    { stage: 'Open leads', value: asNumber(leads._sum.expectedPremium), count: leads._count, link: '/admin/crm/leads' },
    { stage: 'Onboarding', value: asNumber((onboardingCases as any)._sum?.premiumEstimate), count: onboardingCases._count, link: '/admin/crm/onboarding' },
    ...policies.map((row) => ({
      stage: String(row.status).replace(/_/g, ' '),
      value: asNumber(row._sum.totalPremium),
      outstanding: asNumber(row._sum.outstandingAmount),
      count: row._count,
      link: '/policies',
    })),
  ];

  return {
    stages,
    byInsurer: byInsurer.map((row) => {
      const insurer = insurers.find((item) => item.id === row.insurerId);
      return {
        insurerId: row.insurerId,
        insurer: insurer?.shortName || insurer?.name || 'Unknown insurer',
        premium: asNumber(row._sum.totalPremium),
        count: row._count,
        link: '/policies',
      };
    }),
    byClass: Array.from(byClassMap.values()).sort((a, b) => b.premium - a.premium).slice(0, 8),
  };
}

export async function getPremiumCollections(filters: ExecutiveFilters) {
  const [payments, directPayments, outstandingPremium, outstandingPolicies] = await Promise.all([
    prisma.payment.findMany({
      where: paymentWhere(filters),
      select: { id: true, amount: true, paymentDate: true, status: true, method: true, client: true },
      orderBy: { paymentDate: 'asc' },
    }),
    prisma.directInsurerPayment.findMany({
      where: directPaymentWhere(filters),
      select: {
        id: true,
        amount: true,
        paymentDate: true,
        verificationStatus: true,
        insurer: { select: { name: true, shortName: true } },
        policy: { select: { id: true, policyNumber: true } },
      },
      orderBy: { paymentDate: 'asc' },
    }),
    prisma.policy.aggregate({
      where: { ...selectedPolicyWhere(filters), outstandingAmount: { gt: 0 } },
      _sum: { outstandingAmount: true },
      _count: true,
    }),
    prisma.policy.findMany({
      where: { ...selectedPolicyWhere(filters), outstandingAmount: { gt: 0 } },
      select: {
        id: true,
        policyNumber: true,
        totalPremium: true,
        paidAmount: true,
        outstandingAmount: true,
        endDate: true,
        client: true,
        insurer: { select: { name: true, shortName: true } },
      },
      orderBy: { outstandingAmount: 'desc' },
      take: 12,
    }),
  ]);

  const monthly = buildMonthlySeries(filters.dateFrom, filters.dateTo);
  payments.forEach((payment) => {
    const row = monthly.get(monthKey(payment.paymentDate));
    if (row) row.collected += asNumber(payment.amount);
  });
  directPayments.forEach((payment) => {
    const row = monthly.get(monthKey(payment.paymentDate));
    if (row) row.directToInsurer += asNumber(payment.amount);
  });

  return {
    totals: {
      brokerCollected: payments.reduce((sum, row) => sum + asNumber(row.amount), 0),
      directToInsurer: directPayments.reduce((sum, row) => sum + asNumber(row.amount), 0),
      outstandingPremiums: asNumber(outstandingPremium._sum.outstandingAmount),
      outstandingPolicyCount: outstandingPremium._count,
    },
    trend: Array.from(monthly.values()),
    outstanding: outstandingPolicies.map((policy) => ({
      id: policy.id,
      policyNumber: policy.policyNumber,
      client: clientName(policy.client),
      insurer: policy.insurer.shortName || policy.insurer.name,
      totalPremium: asNumber(policy.totalPremium),
      paidAmount: asNumber(policy.paidAmount),
      outstandingAmount: asNumber(policy.outstandingAmount),
      daysToExpiry: daysBetween(new Date(), policy.endDate),
      link: '/payments',
    })),
  };
}

export async function getCommissions(filters: ExecutiveFilters) {
  const [entries, receipts] = await Promise.all([
    prisma.commissionEntry.findMany({
      where: commissionWhere(filters),
      include: {
        agent: true,
        insurer: { select: { name: true, shortName: true } },
        policy: { select: { id: true, policyNumber: true } },
      },
      orderBy: { earnedDate: 'asc' },
    }),
    prisma.insurerCommissionReceipt.findMany({
      where: {
        receivedDate: { gte: filters.dateFrom, lte: filters.dateTo },
        ...(filters.insurerId && { insurerId: filters.insurerId }),
        ...(filters.agentId && { commissionEntry: { agentId: filters.agentId } }),
        ...(filters.insuranceClass && { commissionEntry: { product: { insuranceClass: filters.insuranceClass } } }),
      } as any,
      select: { amount: true, receivedDate: true },
    }),
  ]);

  const monthly = buildMonthlySeries(filters.dateFrom, filters.dateTo);
  entries.forEach((entry) => {
    const row = monthly.get(monthKey(entry.earnedDate));
    if (row) row.commissionReceivable += asNumber(entry.commissionReceivableAmount);
  });
  receipts.forEach((receipt) => {
    const row = monthly.get(monthKey(receipt.receivedDate));
    if (row) row.commissionReceived += asNumber(receipt.amount);
  });

  const agingMap = new Map<string, { bucket: string; amount: number; count: number }>();
  entries
    .filter((entry) => RECEIVABLE_COMMISSION_STATUSES.includes(entry.insurerCommissionStatus))
    .forEach((entry) => {
      const outstanding = Math.max(0, asNumber(entry.commissionReceivableAmount) - asNumber(entry.commissionReceivedAmount));
      const bucket = ageBucket(entry.earnedDate);
      const row = agingMap.get(bucket) ?? { bucket, amount: 0, count: 0 };
      row.amount += outstanding;
      row.count += 1;
      agingMap.set(bucket, row);
    });

  return {
    totals: {
      commissionReceivable: entries.reduce((sum, entry) => sum + Math.max(0, asNumber(entry.commissionReceivableAmount) - asNumber(entry.commissionReceivedAmount)), 0),
      commissionReceived: receipts.reduce((sum, receipt) => sum + asNumber(receipt.amount), 0),
      netCommission: entries.reduce((sum, entry) => sum + asNumber(entry.netCommission), 0),
      entryCount: entries.length,
    },
    trend: Array.from(monthly.values()),
    aging: ['0-30', '31-60', '61-90', '90+', 'Unscheduled'].map((bucket) => agingMap.get(bucket) ?? { bucket, amount: 0, count: 0 }),
    receivables: entries
      .filter((entry) => RECEIVABLE_COMMISSION_STATUSES.includes(entry.insurerCommissionStatus))
      .map((entry) => ({
        id: entry.id,
        policyNumber: entry.policy.policyNumber,
        insurer: entry.insurer?.shortName || entry.insurer?.name || 'Unknown insurer',
        agent: agentName(entry.agent),
        earnedDate: entry.earnedDate,
        status: entry.insurerCommissionStatus,
        outstandingAmount: Math.max(0, asNumber(entry.commissionReceivableAmount) - asNumber(entry.commissionReceivedAmount)),
        link: '/accounting/commission-receivables',
      }))
      .sort((a, b) => b.outstandingAmount - a.outstandingAmount)
      .slice(0, 12),
  };
}

export async function getInsurerPayables(filters: ExecutiveFilters) {
  const remittances = await prisma.insurerRemittance.findMany({
    where: {
      deletedAt: null,
      status: { in: PAYABLE_REMITTANCE_STATUSES as any },
      remittanceDate: { gte: filters.dateFrom, lte: filters.dateTo },
      ...(filters.insurerId && { insurerId: filters.insurerId }),
      ...((filters.agentId || filters.insuranceClass) && {
        lines: {
          some: {
            policy: {
              ...(filters.agentId && { agentId: filters.agentId }),
              ...(filters.insuranceClass && { product: { insuranceClass: filters.insuranceClass } }),
            },
          },
        },
      }),
    } as any,
    include: { insurer: { select: { name: true, shortName: true } } },
    orderBy: { dueDate: 'asc' },
  });

  const agingMap = new Map<string, { bucket: string; amount: number; count: number }>();
  const rows = remittances.map((remittance) => {
    const outstanding = Math.max(0, asNumber(remittance.netRemittanceAmount) - asNumber(remittance.paidAmount));
    const bucket = ageBucket(remittance.dueDate ?? remittance.remittanceDate);
    const aging = agingMap.get(bucket) ?? { bucket, amount: 0, count: 0 };
    aging.amount += outstanding;
    aging.count += 1;
    agingMap.set(bucket, aging);
    return {
      id: remittance.id,
      remittanceNumber: remittance.remittanceNumber,
      insurer: remittance.insurer.shortName || remittance.insurer.name,
      dueDate: remittance.dueDate,
      status: remittance.status,
      grossPremiumAmount: asNumber(remittance.grossPremiumAmount),
      commissionDeductedAmount: asNumber(remittance.commissionDeductedAmount),
      netPayableAmount: asNumber(remittance.netRemittanceAmount),
      paidAmount: asNumber(remittance.paidAmount),
      outstandingAmount: outstanding,
      link: '/accounting/remittances',
    };
  });

  return {
    totals: {
      insurerPayable: rows.reduce((sum, row) => sum + row.outstandingAmount, 0),
      grossPremiumDue: rows.reduce((sum, row) => sum + row.grossPremiumAmount, 0),
      remittanceCount: rows.length,
    },
    aging: ['0-30', '31-60', '61-90', '90+', 'Unscheduled'].map((bucket) => agingMap.get(bucket) ?? { bucket, amount: 0, count: 0 }),
    remittances: rows.sort((a, b) => b.outstandingAmount - a.outstandingAmount).slice(0, 12),
  };
}

export async function getClaimsExposure(filters: ExecutiveFilters) {
  const [openExposure, claims, byStatus, bySeverity] = await Promise.all([
    prisma.claim.aggregate({
      where: { ...claimWhere(filters), status: { in: OPEN_CLAIM_STATUSES as any } },
      _sum: { amountClaimed: true, amountApproved: true, amountPaid: true },
      _count: true,
    }),
    prisma.claim.findMany({
      where: { ...claimWhere(filters), status: { in: OPEN_CLAIM_STATUSES as any } },
      include: {
        client: true,
        insurer: { select: { name: true, shortName: true } },
        policy: { select: { id: true, policyNumber: true, agentId: true } },
      },
      orderBy: { amountClaimed: 'desc' },
      take: 12,
    }),
    prisma.claim.groupBy({
      by: ['status'],
      where: { ...claimWhere(filters), status: { notIn: FINAL_CLAIM_STATUSES as any } },
      _sum: { amountClaimed: true, amountApproved: true, amountPaid: true },
      _count: true,
    }),
    prisma.claim.groupBy({
      by: ['severity'],
      where: { ...claimWhere(filters), status: { notIn: FINAL_CLAIM_STATUSES as any } },
      _sum: { amountClaimed: true },
      _count: true,
    }),
  ]);

  return {
    totals: {
      openClaimsValue: asNumber(openExposure._sum.amountClaimed),
      openClaimsCount: openExposure._count,
      approvedExposure: asNumber(openExposure._sum.amountApproved),
      paidAmount: asNumber(openExposure._sum.amountPaid),
    },
    byStatus: byStatus.map((row) => ({
      status: row.status,
      amountClaimed: asNumber(row._sum.amountClaimed),
      amountApproved: asNumber(row._sum.amountApproved),
      amountPaid: asNumber(row._sum.amountPaid),
      count: row._count,
    })),
    bySeverity: bySeverity.map((row) => ({
      severity: row.severity,
      amountClaimed: asNumber(row._sum.amountClaimed),
      count: row._count,
    })),
    highExposureClaims: claims.map((claim) => ({
      id: claim.id,
      claimNumber: claim.claimNumber,
      policyNumber: claim.policy.policyNumber,
      client: clientName(claim.client),
      insurer: claim.insurer.shortName || claim.insurer.name,
      status: claim.status,
      severity: claim.severity,
      amountClaimed: asNumber(claim.amountClaimed),
      resolutionDueAt: claim.resolutionDueAt,
      link: `/claims/${claim.id}`,
    })),
  };
}

export async function getRenewalRisk(filters: ExecutiveFilters) {
  const now = new Date();
  const horizon = addDays(now, 90);
  const policies = await prisma.policy.findMany({
    where: {
      ...selectedPolicyWhere(filters),
      status: { in: ACTIVE_POLICY_STATUSES as any },
      renewedTo: null,
      endDate: { gte: now, lte: horizon },
    },
    include: {
      client: true,
      insurer: { select: { name: true, shortName: true } },
      agent: true,
      product: { select: { name: true, insuranceClass: true } },
    },
    orderBy: { endDate: 'asc' },
    take: 30,
  });

  const buckets = [
    { bucket: '0-15 days', count: 0, premium: 0 },
    { bucket: '16-30 days', count: 0, premium: 0 },
    { bucket: '31-60 days', count: 0, premium: 0 },
    { bucket: '61-90 days', count: 0, premium: 0 },
  ];

  const rows = policies.map((policy) => {
    const daysToExpiry = daysBetween(now, policy.endDate);
    const bucket = daysToExpiry <= 15 ? buckets[0] : daysToExpiry <= 30 ? buckets[1] : daysToExpiry <= 60 ? buckets[2] : buckets[3];
    bucket.count += 1;
    bucket.premium += asNumber(policy.totalPremium);
    return {
      id: policy.id,
      policyNumber: policy.policyNumber,
      client: clientName(policy.client),
      insurer: policy.insurer.shortName || policy.insurer.name,
      agent: agentName(policy.agent),
      product: policy.product.name,
      insuranceClass: policy.product.insuranceClass,
      endDate: policy.endDate,
      daysToExpiry,
      outstandingAmount: asNumber(policy.outstandingAmount),
      totalPremium: asNumber(policy.totalPremium),
      riskLevel: riskLevel(daysToExpiry, asNumber(policy.outstandingAmount)),
      link: '/renewals',
    };
  });

  return {
    totals: {
      renewalRiskCount: rows.length,
      premiumAtRisk: rows.reduce((sum, row) => sum + row.totalPremium, 0),
      outstandingOnRenewals: rows.reduce((sum, row) => sum + row.outstandingAmount, 0),
    },
    buckets,
    policies: rows,
  };
}

export async function getAgentPerformance(filters: ExecutiveFilters) {
  const policies = await prisma.policy.groupBy({
    by: ['agentId'],
    where: {
      ...policyDateWhere(filters),
      agentId: { not: null },
    },
    _sum: { totalPremium: true, paidAmount: true, outstandingAmount: true },
    _count: true,
    orderBy: { _sum: { totalPremium: 'desc' } },
    take: 12,
  });

  const agentIds = policies.map((row) => row.agentId).filter((id): id is string => Boolean(id));
  const [agents, commissions] = await Promise.all([
    prisma.agent.findMany({ where: { id: { in: agentIds } } }),
    prisma.commissionEntry.groupBy({
      by: ['agentId'],
      where: { ...commissionWhere(filters), agentId: { in: agentIds } },
      _sum: { netCommission: true },
      _count: true,
    }),
  ]);

  return {
    agents: policies.map((row) => {
      const agent = agents.find((item) => item.id === row.agentId);
      const commission = commissions.find((item) => item.agentId === row.agentId);
      return {
        agentId: row.agentId,
        agent: agentName(agent),
        policyCount: row._count,
        totalPremium: asNumber(row._sum.totalPremium),
        collectedPremium: asNumber(row._sum.paidAmount),
        outstandingPremium: asNumber(row._sum.outstandingAmount),
        netCommission: asNumber(commission?._sum.netCommission),
        commissionEntries: commission?._count ?? 0,
        link: row.agentId ? `/agents` : '/agents',
      };
    }),
  };
}

export async function getCashPosition() {
  const [bankAccounts, mpesaAccounts, trustLedger, insurerPayableLedger] = await Promise.all([
    prisma.bankAccount.findMany({ where: { deletedAt: null, isActive: true }, orderBy: { accountName: 'asc' } }),
    prisma.mpesaAccount.findMany({ where: { deletedAt: null, isActive: true }, orderBy: { accountName: 'asc' } }),
    prisma.ledgerAccount.findFirst({ where: { code: '2010' } }),
    prisma.ledgerAccount.findFirst({ where: { code: '2000' } }),
  ]);

  const accounts = [
    ...bankAccounts.map((account) => ({
      id: account.id,
      name: account.accountName,
      institution: account.bankName,
      type: account.accountType,
      channel: 'Bank',
      balance: asNumber(account.currentBalance),
      link: '/accounting/accounts',
    })),
    ...mpesaAccounts.map((account) => ({
      id: account.id,
      name: account.accountName,
      institution: account.shortCode,
      type: account.accountType,
      channel: 'M-Pesa',
      balance: asNumber(account.currentBalance),
      link: '/accounting/accounts',
    })),
  ];

  return {
    totals: {
      trustAccountBalance: accounts.filter((account) => account.type.includes('TRUST')).reduce((sum, account) => sum + account.balance, 0),
      operatingAccountBalance: accounts.filter((account) => account.type.includes('OPERATING')).reduce((sum, account) => sum + account.balance, 0),
      totalCashPosition: accounts.reduce((sum, account) => sum + account.balance, 0),
      trustLedgerBalance: asNumber(trustLedger?.currentBalance),
      insurerPayableLedgerBalance: asNumber(insurerPayableLedger?.currentBalance),
    },
    accounts,
  };
}

export async function getSlaBreaches(filters: ExecutiveFilters) {
  const now = new Date();
  const taskWhere = {
    status: { in: ['PENDING', 'IN_PROGRESS'] as any },
    dueDate: { lt: now },
    ...(filters.insurerId && { insurerId: filters.insurerId }),
    ...(filters.agentId && { agentId: filters.agentId }),
  };
  const claimBreachWhere = {
    ...claimWhere(filters),
    status: { notIn: FINAL_CLAIM_STATUSES as any },
    OR: [
      { acknowledgementDueAt: { lt: now } },
      { documentsDueAt: { lt: now } },
      { submissionDueAt: { lt: now } },
      { insurerFollowUpDueAt: { lt: now } },
      { resolutionDueAt: { lt: now } },
    ],
  };

  const [taskCount, claimCount, criticalTaskCount, criticalClaimCount, tasks, claims] = await Promise.all([
    prisma.task.count({ where: taskWhere as any }),
    prisma.claim.count({ where: claimBreachWhere as any }),
    prisma.task.count({
      where: {
        ...(taskWhere as any),
        OR: [
          { priority: 'URGENT' },
          { dueDate: { lt: addDays(now, -7) } },
        ],
      } as any,
    }),
    prisma.claim.count({
      where: {
        ...(claimBreachWhere as any),
        OR: [
          { priority: { in: ['URGENT', 'VIP'] as any } },
          { acknowledgementDueAt: { lt: addDays(now, -7) } },
          { documentsDueAt: { lt: addDays(now, -7) } },
          { submissionDueAt: { lt: addDays(now, -7) } },
          { insurerFollowUpDueAt: { lt: addDays(now, -7) } },
          { resolutionDueAt: { lt: addDays(now, -7) } },
        ],
      } as any,
    }),
    prisma.task.findMany({
      where: taskWhere as any,
      include: {
        assignedTo: { select: { firstName: true, lastName: true } },
        client: true,
        policy: { select: { id: true, policyNumber: true } },
        claim: { select: { id: true, claimNumber: true } },
      },
      orderBy: { dueDate: 'asc' },
      take: 20,
    }),
    prisma.claim.findMany({
      where: claimBreachWhere as any,
      include: { client: true },
      orderBy: { resolutionDueAt: 'asc' },
      take: 20,
    }),
  ]);

  const taskRows = tasks.map((task) => ({
    id: task.id,
    type: 'Task',
    reference: task.title,
    owner: task.assignedTo ? `${task.assignedTo.firstName} ${task.assignedTo.lastName}` : 'Unassigned',
    client: clientName(task.client),
    dueAt: task.dueDate,
    daysOverdue: task.dueDate ? Math.max(0, -daysBetween(now, task.dueDate)) : 0,
    priority: task.priority,
    status: task.status,
    link: '/admin/crm/tasks',
  }));

  const claimRows = claims.map((claim) => {
    const dueDates = [
      claim.acknowledgementDueAt,
      claim.documentsDueAt,
      claim.submissionDueAt,
      claim.insurerFollowUpDueAt,
      claim.resolutionDueAt,
    ].filter((date): date is Date => Boolean(date));
    const earliest = dueDates.sort((a, b) => a.getTime() - b.getTime())[0] ?? null;
    return {
      id: claim.id,
      type: 'Claim',
      reference: claim.claimNumber,
      owner: 'Claims team',
      client: clientName(claim.client),
      dueAt: earliest,
      daysOverdue: earliest ? Math.max(0, -daysBetween(now, earliest)) : 0,
      priority: claim.priority,
      status: claim.status,
      link: `/claims/${claim.id}`,
    };
  });

  const rows = [...taskRows, ...claimRows].sort((a, b) => b.daysOverdue - a.daysOverdue).slice(0, 20);
  return {
    totals: {
      slaBreaches: taskCount + claimCount,
      taskBreaches: taskCount,
      claimBreaches: claimCount,
      criticalBreaches: criticalTaskCount + criticalClaimCount,
    },
    breaches: rows,
  };
}

export async function getClientGrowth(filters: ExecutiveFilters) {
  const [clients, leads] = await Promise.all([
    prisma.client.findMany({
      where: { deletedAt: null, createdAt: { gte: filters.dateFrom, lte: filters.dateTo } },
      select: { id: true, createdAt: true, type: true, relationshipManagerId: true },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.lead.findMany({
      where: { deletedAt: null, createdAt: { gte: filters.dateFrom, lte: filters.dateTo } },
      select: { id: true, createdAt: true, status: true },
      orderBy: { createdAt: 'asc' },
    }),
  ]);

  const monthly = buildMonthlySeries(filters.dateFrom, filters.dateTo);
  clients.forEach((client) => {
    const row = monthly.get(monthKey(client.createdAt));
    if (row) row.clients += 1;
  });
  leads.forEach((lead) => {
    const row = monthly.get(monthKey(lead.createdAt));
    if (row) row.leads += 1;
  });

  const byType = new Map<string, number>();
  clients.forEach((client) => byType.set(client.type, (byType.get(client.type) ?? 0) + 1));

  return {
    totals: {
      newClients: clients.length,
      newLeads: leads.length,
      convertedLeads: leads.filter((lead) => lead.status === 'WON').length,
      conversionRate: leads.length ? Math.round((leads.filter((lead) => lead.status === 'WON').length / leads.length) * 100) : 0,
    },
    trend: Array.from(monthly.values()),
    byType: Array.from(byType.entries()).map(([type, count]) => ({ type, count })),
  };
}

export async function getExecutiveSummary(filters: ExecutiveFilters) {
  const [
    policyPremium,
    brokerCollected,
    outstandingPremium,
    commissionEntries,
    commissionReceipts,
    insurerPayables,
    cashPosition,
    claimsExposure,
    renewalRisk,
    slaBreaches,
    clientGrowth,
  ] = await Promise.all([
    prisma.policy.aggregate({ where: policyDateWhere(filters), _sum: { totalPremium: true }, _count: true }),
    prisma.payment.aggregate({ where: paymentWhere(filters), _sum: { amount: true }, _count: true }),
    prisma.policy.aggregate({ where: { ...selectedPolicyWhere(filters), outstandingAmount: { gt: 0 } }, _sum: { outstandingAmount: true }, _count: true }),
    prisma.commissionEntry.aggregate({
      where: { ...commissionWhere(filters), insurerCommissionStatus: { in: RECEIVABLE_COMMISSION_STATUSES as any } },
      _sum: { commissionReceivableAmount: true, commissionReceivedAmount: true },
      _count: true,
    }),
    prisma.insurerCommissionReceipt.aggregate({
      where: {
        receivedDate: { gte: filters.dateFrom, lte: filters.dateTo },
        ...(filters.insurerId && { insurerId: filters.insurerId }),
        ...(filters.agentId && { commissionEntry: { agentId: filters.agentId } }),
      },
      _sum: { amount: true },
      _count: true,
    }),
    getInsurerPayables(filters),
    getCashPosition(),
    getClaimsExposure(filters),
    getRenewalRisk(filters),
    getSlaBreaches(filters),
    getClientGrowth(filters),
  ]);

  return {
    filters: {
      dateFrom: filters.dateFrom,
      dateTo: filters.dateTo,
      insurerId: filters.insurerId ?? null,
      agentId: filters.agentId ?? null,
      insuranceClass: filters.insuranceClass ?? null,
    },
    generatedAt: new Date(),
    kpis: {
      totalPremiumThisMonth: asNumber(policyPremium._sum.totalPremium),
      totalPremiumPolicyCount: policyPremium._count,
      premiumCollected: asNumber(brokerCollected._sum.amount),
      premiumCollectedCount: brokerCollected._count,
      outstandingPremiums: asNumber(outstandingPremium._sum.outstandingAmount),
      outstandingPremiumPolicyCount: outstandingPremium._count,
      commissionReceivable: Math.max(0, asNumber(commissionEntries._sum.commissionReceivableAmount) - asNumber(commissionEntries._sum.commissionReceivedAmount)),
      commissionReceived: asNumber(commissionReceipts._sum.amount),
      insurerPayable: insurerPayables.totals.insurerPayable,
      trustAccountBalance: cashPosition.totals.trustAccountBalance,
      operatingAccountBalance: cashPosition.totals.operatingAccountBalance,
      openClaimsValue: claimsExposure.totals.openClaimsValue,
      renewalRiskCount: renewalRisk.totals.renewalRiskCount,
      slaBreaches: slaBreaches.totals.slaBreaches,
      newClientsThisMonth: clientGrowth.totals.newClients,
    },
    highlights: {
      premiumAtRisk: renewalRisk.totals.premiumAtRisk,
      criticalSlaBreaches: slaBreaches.totals.criticalBreaches,
      openClaimsCount: claimsExposure.totals.openClaimsCount,
      totalCashPosition: cashPosition.totals.totalCashPosition,
    },
  };
}
