import { prisma } from '../../config/database';
import { getPolicyActivationReadiness } from '../policies/policies.service';
import { recognizePolicyCommission } from '../payments/payments.service';

function timelineItem(type: string, date: Date, title: string, metadata: Record<string, unknown> = {}) {
  return { type, date, title, metadata };
}

export async function getPolicyWorkflowReadiness(policyId: string) {
  return getPolicyActivationReadiness(policyId);
}

export async function getClientLifecycleSummary(clientId: string) {
  const client = await prisma.client.findFirst({
    where: { id: clientId, deletedAt: null },
    select: {
      id: true,
      clientNumber: true,
      type: true,
      firstName: true,
      lastName: true,
      companyName: true,
      tradingName: true,
    },
  });
  if (!client) throw new Error('Client not found');

  const [onboardingCases, policies, payments, directPayments, tasks, communications] = await Promise.all([
    prisma.onboardingCase.findMany({
      where: { clientId },
      select: { id: true, caseNumber: true, status: true, productId: true, insurerId: true, createdAt: true, updatedAt: true },
      orderBy: { updatedAt: 'desc' },
    }),
    prisma.policy.findMany({
      where: { clientId, deletedAt: null },
      select: {
        id: true,
        policyNumber: true,
        status: true,
        premiumCollectionMode: true,
        totalPremium: true,
        paidAmount: true,
        outstandingAmount: true,
        startDate: true,
        endDate: true,
        product: { select: { id: true, name: true } },
        insurer: { select: { id: true, name: true, shortName: true } },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.payment.findMany({
      where: { clientId, deletedAt: null },
      select: { id: true, paymentNumber: true, amount: true, status: true, paymentDate: true, accountingPostedStatus: true },
      orderBy: { paymentDate: 'desc' },
      take: 20,
    }),
    prisma.directInsurerPayment.findMany({
      where: { clientId, deletedAt: null },
      select: {
        id: true,
        acknowledgementNumber: true,
        amount: true,
        verificationStatus: true,
        paymentDate: true,
        accountingPostedStatus: true,
      },
      orderBy: { paymentDate: 'desc' },
      take: 20,
    }),
    prisma.task.findMany({
      where: { clientId, status: { notIn: ['COMPLETED', 'CANCELLED'] } },
      select: { id: true, title: true, category: true, priority: true, dueDate: true, status: true, policyId: true, paymentId: true },
      orderBy: [{ dueDate: 'asc' }, { priority: 'desc' }],
      take: 20,
    }),
    prisma.messageLog.findMany({
      where: { clientId },
      select: { id: true, channel: true, messageType: true, status: true, subject: true, sentAt: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: 20,
    }),
  ]);

  return {
    client,
    counts: {
      onboardingCases: onboardingCases.length,
      policies: policies.length,
      payments: payments.length,
      directPayments: directPayments.length,
      openTasks: tasks.length,
      communications: communications.length,
    },
    onboardingCases,
    policies,
    payments,
    directPayments,
    openTasks: tasks,
    communications,
  };
}

export async function getPolicyFinancialSummary(policyId: string) {
  const policy = await prisma.policy.findFirst({
    where: { id: policyId, deletedAt: null },
    include: {
      client: { select: { id: true, clientNumber: true, firstName: true, lastName: true, companyName: true, tradingName: true } },
      product: { select: { id: true, name: true, code: true } },
      insurer: { select: { id: true, name: true, shortName: true } },
      paymentAllocations: {
        where: { reversedAt: null },
        include: { payment: { select: { id: true, paymentNumber: true, amount: true, status: true, accountingPostedStatus: true, receipt: true } } },
      },
      directInsurerPayments: { where: { deletedAt: null }, orderBy: { paymentDate: 'desc' } },
      commissionEntries: { where: { status: { notIn: ['CANCELLED', 'CLAWED_BACK'] } }, orderBy: { earnedDate: 'desc' } },
      journalEntries: { include: { lines: { include: { account: true } } }, orderBy: { entryDate: 'desc' } },
    },
  });
  if (!policy) throw new Error('Policy not found');

  const brokerCollected = policy.paymentAllocations.reduce((sum, allocation) => sum + Number(allocation.amount), 0);
  const directToInsurer = policy.directInsurerPayments
    .filter((payment) => payment.verificationStatus === 'VERIFIED')
    .reduce((sum, payment) => sum + Number(payment.amount), 0);
  const agencyCommission = policy.commissionEntries
    .filter((entry) => !entry.agentId)
    .reduce((sum, entry) => sum + Number(entry.grossCommission), 0);
  const agentCommission = policy.commissionEntries
    .filter((entry) => !!entry.agentId)
    .reduce((sum, entry) => sum + Number(entry.grossCommission), 0);

  return {
    policy,
    totals: {
      totalPremium: Number(policy.totalPremium),
      brokerCollected,
      directToInsurer,
      outstanding: Number(policy.outstandingAmount),
      agencyCommission,
      agentCommission,
      commissionReceivable: Number(policy.commissionReceivableAmount),
      commissionReceived: Number(policy.commissionReceivedAmount),
    },
    paymentStatus: {
      premiumCollectionMode: policy.premiumCollectionMode,
      paymentVerificationStatus: policy.paymentVerificationStatus,
      accountingPostedStatus: policy.accountingPostedStatus,
    },
  };
}

export async function getPolicyCommissionSummary(policyId: string) {
  await ensurePolicy(policyId);
  const entries = await prisma.commissionEntry.findMany({
    where: { policyId, status: { notIn: ['CANCELLED', 'CLAWED_BACK'] } },
    include: { agent: true, insurer: true, product: true, journalEntries: true },
    orderBy: { earnedDate: 'desc' },
  });
  return {
    entries,
    totals: {
      agencyGross: entries.filter((entry) => !entry.agentId).reduce((sum, entry) => sum + Number(entry.grossCommission), 0),
      agentGross: entries.filter((entry) => !!entry.agentId).reduce((sum, entry) => sum + Number(entry.grossCommission), 0),
      receivable: entries.reduce((sum, entry) => sum + Number(entry.commissionReceivableAmount), 0),
      received: entries.reduce((sum, entry) => sum + Number(entry.commissionReceivedAmount), 0),
    },
  };
}

export async function getPolicyAccountingSummary(policyId: string) {
  await ensurePolicy(policyId);
  const entries = await prisma.journalEntry.findMany({
    where: { policyId },
    include: { lines: { include: { account: true } } },
    orderBy: { entryDate: 'desc' },
  });
  return {
    entries,
    balanced: entries.every((entry) => Number(entry.totalDebit) === Number(entry.totalCredit)),
    totals: {
      debit: entries.reduce((sum, entry) => sum + Number(entry.totalDebit), 0),
      credit: entries.reduce((sum, entry) => sum + Number(entry.totalCredit), 0),
    },
  };
}

export async function calculatePolicyCommission(policyId: string, userId: string) {
  const policy = await prisma.policy.findFirst({
    where: { id: policyId, deletedAt: null },
    select: { id: true, premiumCollectionMode: true },
  });
  if (!policy) throw new Error('Policy not found');

  const source = policy.premiumCollectionMode === 'DIRECT_TO_INSURER'
    ? 'DIRECT_TO_INSURER_PREMIUM'
    : 'BROKER_COLLECTED_PREMIUM';

  const commissionEntryId = await prisma.$transaction((tx) => recognizePolicyCommission(tx, policy.id, source, userId), {
    timeout: 30000,
  });
  return getPolicyCommissionSummary(policyId).then((summary) => ({ commissionEntryId, ...summary }));
}

export async function getPolicyTimeline(policyId: string) {
  const policy = await prisma.policy.findFirst({
    where: { id: policyId, deletedAt: null },
    include: {
      events: true,
      documents: true,
      paymentAllocations: { include: { payment: { include: { receipt: true } } } },
      directInsurerPayments: true,
      commissionEntries: true,
      journalEntries: true,
      tasks: true,
    },
  });
  if (!policy) throw new Error('Policy not found');

  const items = [
    timelineItem('POLICY_CREATED', policy.createdAt, `Policy ${policy.policyNumber} created`, { status: policy.status }),
    ...policy.events.map((event) => timelineItem(event.eventType, event.createdAt, event.description, (event.metadata as Record<string, unknown> | null) ?? {})),
    ...policy.documents.map((doc) => timelineItem('DOCUMENT', doc.createdAt, doc.name, { documentId: doc.id, type: doc.type })),
    ...policy.paymentAllocations.map((allocation) => timelineItem('PAYMENT', allocation.createdAt, `Payment allocated: ${allocation.payment.paymentNumber}`, {
      paymentId: allocation.paymentId,
      amount: allocation.amount,
      receiptId: allocation.payment.receipt?.id,
    })),
    ...policy.directInsurerPayments.map((payment) => timelineItem('DIRECT_INSURER_PAYMENT', payment.createdAt, `Direct insurer payment ${payment.verificationStatus}`, {
      directInsurerPaymentId: payment.id,
      amount: payment.amount,
      acknowledgementNumber: payment.acknowledgementNumber,
    })),
    ...policy.commissionEntries.map((entry) => timelineItem('COMMISSION', entry.createdAt, `Commission ${entry.status}`, {
      commissionEntryId: entry.id,
      amount: entry.grossCommission,
      agentId: entry.agentId,
    })),
    ...policy.journalEntries.map((entry) => timelineItem('ACCOUNTING', entry.createdAt, `Journal ${entry.entryNumber} posted`, {
      journalEntryId: entry.id,
      event: entry.postingEvent,
      debit: entry.totalDebit,
      credit: entry.totalCredit,
    })),
    ...policy.tasks.map((task) => timelineItem('TASK', task.createdAt, task.title, {
      taskId: task.id,
      status: task.status,
      dueDate: task.dueDate,
    })),
  ];

  return items.sort((a, b) => b.date.getTime() - a.date.getTime());
}

async function ensurePolicy(policyId: string) {
  const policy = await prisma.policy.findFirst({ where: { id: policyId, deletedAt: null }, select: { id: true } });
  if (!policy) throw new Error('Policy not found');
  return policy;
}
