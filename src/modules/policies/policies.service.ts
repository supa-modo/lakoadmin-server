import { prisma } from '../../config/database';
import { AuthRequest } from '../../types/express';
import {
  CreatePolicyInput,
  UpdatePolicyInput,
  CreateMemberInput,
  UpdateMemberInput,
  CreateEndorsementInput,
  CreateRenewalInput,
} from './policies.validation';
import { generatePolicyNumber, generateEndorsementNumber } from './policyNumber.service';
import { calculatePremium } from './premium.service';
import { ensureWorkflowTask } from '../workflows/workflowTaskAutomation.service';

function getClientFullName(client: any): string | null {
  if (!client) return null;

  const fromPerson = `${client.firstName ?? ''} ${client.lastName ?? ''}`.trim();
  const fromCompany = (client.companyName ?? client.tradingName ?? '').trim();

  return (fromPerson || fromCompany) ? (fromPerson || fromCompany) : null;
}

function attachClientFullName<T extends { client?: any }>(entity: T): T {
  if (!entity?.client) return entity;
  return {
    ...entity,
    client: {
      ...entity.client,
      fullName: getClientFullName(entity.client),
    },
  };
}

// ─────────────────────────────────────────────────────────
// LIST / GET
// ─────────────────────────────────────────────────────────

export async function listPolicies(req: AuthRequest) {
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(100, parseInt(req.query.limit as string) || 20);
  const skip = (page - 1) * limit;

  const search = (req.query.search as string) || '';
  const status = req.query.status as string | undefined;
  const clientId = req.query.clientId as string | undefined;
  const insurerId = req.query.insurerId as string | undefined;
  const productId = req.query.productId as string | undefined;
  const agentId = req.query.agentId as string | undefined;
  const paymentFrequency = req.query.paymentFrequency as string | undefined;
  const expiringInDays = req.query.expiringInDays ? parseInt(req.query.expiringInDays as string) : undefined;
  const sortBy = (req.query.sortBy as string) || 'createdAt';
  const sortOrder = (req.query.sortOrder as 'asc' | 'desc') || 'desc';

  const now = new Date();
  const expiryThreshold = expiringInDays ? new Date(now.getTime() + expiringInDays * 86400000) : undefined;

  const where: any = {
    deletedAt: null,
    ...(status && { status }),
    ...(clientId && { clientId }),
    ...(insurerId && { insurerId }),
    ...(productId && { productId }),
    ...(agentId && { agentId }),
    ...(paymentFrequency && { paymentFrequency }),
    ...(expiryThreshold && { endDate: { lte: expiryThreshold, gte: now } }),
    ...(search && {
      OR: [
        { policyNumber: { contains: search, mode: 'insensitive' } },
        { insurerPolicyNumber: { contains: search, mode: 'insensitive' } },
        {
          client: {
            is: {
              OR: [
                { firstName: { contains: search, mode: 'insensitive' } },
                { lastName: { contains: search, mode: 'insensitive' } },
                { companyName: { contains: search, mode: 'insensitive' } },
                { tradingName: { contains: search, mode: 'insensitive' } },
              ],
            },
          },
        },
        { product: { name: { contains: search, mode: 'insensitive' } } },
        { insurer: { name: { contains: search, mode: 'insensitive' } } },
      ],
    }),
  };

  const orderBy: any = {};
  const validSortFields = ['policyNumber', 'startDate', 'endDate', 'totalPremium', 'createdAt', 'status'];
  if (validSortFields.includes(sortBy)) {
    orderBy[sortBy] = sortOrder;
  } else {
    orderBy.createdAt = 'desc';
  }

  const [policies, total] = await Promise.all([
    prisma.policy.findMany({
      where,
      skip,
      take: limit,
      orderBy,
      include: {
        client: { select: { id: true, firstName: true, lastName: true, companyName: true, tradingName: true, type: true, email: true, phone: true } },
        product: { select: { id: true, name: true, code: true, category: true } },
        insurer: { select: { id: true, name: true, shortName: true, logoUrl: true } },
        agent: { select: { id: true, firstName: true, lastName: true } },
        _count: { select: { members: true, endorsements: true, documents: true, claims: true } },
      },
    }),
    prisma.policy.count({ where }),
  ]);

  return { policies: policies.map(attachClientFullName), total, page, limit };
}

export async function getPolicyById(id: string) {
  const policy = await prisma.policy.findFirst({
    where: { id, deletedAt: null },
    include: {
      client: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          companyName: true,
          tradingName: true,
          type: true,
          email: true,
          phone: true,
          nationalId: true,
          kraPin: true,
        },
      },
      product: {
        select: {
          id: true, name: true, code: true, category: true, subcategory: true,
          description: true, coverageDetails: true,
        },
      },
      insurer: {
        select: {
          id: true, name: true, shortName: true, logoUrl: true,
          phone: true, email: true,
        },
      },
      agent: { select: { id: true, firstName: true, lastName: true, phone: true, email: true } },
      renewedFrom: { select: { id: true, policyNumber: true, endDate: true } },
      renewedTo: { select: { id: true, policyNumber: true, startDate: true, status: true } },
      claims: {
        where: { deletedAt: null },
        take: 10,
        orderBy: { dateReported: 'desc' },
        include: {
          client: { select: { id: true, clientNumber: true, firstName: true, lastName: true, companyName: true, tradingName: true } },
          policy: { select: { id: true, policyNumber: true } },
        },
      },
      _count: { select: { members: true, endorsements: true, documents: true, claims: true, events: true } },
    },
  });

  if (!policy) throw new Error('Policy not found');
  return attachClientFullName(policy);
}

export async function getPolicyStats() {
  const now = new Date();
  const thirtyDays = new Date(now.getTime() + 30 * 86400000);

  const [total, active, expiringSoon, suspended, draft, totalPremiumResult] = await Promise.all([
    prisma.policy.count({ where: { deletedAt: null } }),
    prisma.policy.count({ where: { deletedAt: null, status: 'ACTIVE' } }),
    prisma.policy.count({ where: { deletedAt: null, status: 'ACTIVE', endDate: { lte: thirtyDays, gte: now } } }),
    prisma.policy.count({ where: { deletedAt: null, status: 'SUSPENDED' } }),
    prisma.policy.count({ where: { deletedAt: null, status: 'DRAFT' } }),
    prisma.policy.aggregate({ where: { deletedAt: null, status: 'ACTIVE' }, _sum: { totalPremium: true } }),
  ]);

  return {
    total,
    active,
    expiringSoon,
    suspended,
    draft,
    activePremiumTotal: totalPremiumResult._sum.totalPremium ?? 0,
  };
}

type ActivationReadinessCheck = {
  key: string;
  label: string;
  passed: boolean;
  message: string;
  severity: 'required' | 'recommended';
};

export async function getPolicyActivationReadiness(id: string) {
  const policy = await prisma.policy.findFirst({
    where: { id, deletedAt: null },
    include: {
      client: { select: { id: true, type: true, firstName: true, lastName: true, companyName: true } },
      product: { select: { id: true, name: true, requiredDocuments: true } },
      insurer: { select: { id: true, name: true } },
      onboardingCase: { select: { id: true, caseNumber: true, status: true, memberData: true } },
      documents: { select: { id: true, type: true, name: true } },
      members: { where: { status: 'ACTIVE' }, select: { id: true } },
      paymentAllocations: {
        where: { reversedAt: null },
        include: { payment: { include: { receipt: true } } },
      },
      directInsurerPayments: { where: { deletedAt: null } },
      commissionEntries: {
        where: { status: { notIn: ['CANCELLED', 'CLAWED_BACK'] } },
        select: { id: true, accountingPostedStatus: true },
      },
    },
  });

  if (!policy) throw new Error('Policy not found');

  const allowInternalActivation = await prisma.setting.findUnique({
    where: { key: 'policy.allowInternalActivationWithoutInsurerNumber' },
    select: { value: true },
  }).then((setting) => setting?.value === 'true').catch(() => false);

  const hasSchedule = policy.documents.some((doc) => doc.type === 'POLICY_SCHEDULE');
  const hasCertificate = policy.documents.some((doc) => doc.type === 'CERTIFICATE');
  const outstanding = Number(policy.outstandingAmount);
  const totalPremium = Number(policy.totalPremium);
  const paid = Number(policy.paidAmount);
  const mode = policy.premiumCollectionMode;
  const brokerPaid = Number(policy.brokerCollectedAmount);
  const directPaid = Number(policy.directToInsurerAmount);
  const hasReceipt = policy.paymentAllocations.some((allocation) => !!allocation.payment?.receipt && !allocation.payment.receipt.voidedAt);
  const verifiedDirectPayments = policy.directInsurerPayments.filter((payment) => payment.verificationStatus === 'VERIFIED');
  const directVerifiedAmount = verifiedDirectPayments.reduce((sum, payment) => sum + Number(payment.amount), 0);
  const hasVerifiedDirectPayment = directVerifiedAmount > 0;
  const directPaymentsHaveReferences = verifiedDirectPayments.every((payment) => !!payment.insurerReference);
  const directPaymentsHaveProof = verifiedDirectPayments.every((payment) => !!payment.proofOfPaymentDocumentId || !!payment.acknowledgementDocumentId);
  const hasCommissionReceivable = Number(policy.commissionReceivableAmount) > 0 || policy.commissionEntries.length > 0;
  const hasCommissionAccounted = hasCommissionReceivable || Number(policy.commissionReceivedAmount) > 0;
  const hasAccountingPosted =
    policy.accountingPostedStatus === 'POSTED' ||
    policy.commissionEntries.some((entry) => entry.accountingPostedStatus === 'POSTED') ||
    verifiedDirectPayments.some((payment) => payment.accountingPostedStatus === 'POSTED');

  const directPaymentIssues = [
    !hasVerifiedDirectPayment ? 'record and verify a direct insurer payment' : null,
    hasVerifiedDirectPayment && directVerifiedAmount < totalPremium
      ? `verified direct payment total is KES ${directVerifiedAmount.toLocaleString('en-KE', { maximumFractionDigits: 0 })}, below total premium KES ${totalPremium.toLocaleString('en-KE', { maximumFractionDigits: 0 })}`
      : null,
    hasVerifiedDirectPayment && !directPaymentsHaveReferences ? 'add insurer reference to every verified direct payment' : null,
    hasVerifiedDirectPayment && !directPaymentsHaveProof ? 'link proof of payment or acknowledgement to every verified direct payment' : null,
    !hasCommissionAccounted ? 'calculate or confirm commission receivable' : null,
  ].filter(Boolean);

  const mixedPaymentIssues = [
    brokerPaid <= 0 ? 'record the broker-collected portion' : null,
    brokerPaid > 0 && !hasReceipt ? 'generate a broker receipt for the broker-collected portion' : null,
    !hasVerifiedDirectPayment ? 'record and verify the direct-to-insurer portion' : null,
    hasVerifiedDirectPayment && !directPaymentsHaveReferences ? 'add insurer reference to every verified direct payment' : null,
    outstanding > 0 ? `clear outstanding premium of KES ${outstanding.toLocaleString('en-KE', { maximumFractionDigits: 0 })}` : null,
    !hasCommissionAccounted ? 'calculate or confirm commission' : null,
  ].filter(Boolean);

  const memberData = policy.onboardingCase?.memberData as any;
  const expectedMembers = Array.isArray(memberData?.members) ? memberData.members.length : 0;
  const expectsGroupMembers = ['GROUP', 'CORPORATE', 'SME'].includes(policy.client.type) && expectedMembers > 0;

  const checks: ActivationReadinessCheck[] = [
    {
      key: 'client_attached',
      label: 'Client attached',
      passed: !!policy.clientId && !!policy.client,
      message: policy.client ? 'Client record is linked.' : 'Attach a client record.',
      severity: 'required',
    },
    {
      key: 'product_attached',
      label: 'Product attached',
      passed: !!policy.productId && !!policy.product,
      message: policy.product ? 'Product is linked.' : 'Select the insurance product.',
      severity: 'required',
    },
    {
      key: 'insurer_attached',
      label: 'Insurer attached',
      passed: !!policy.insurerId && !!policy.insurer,
      message: policy.insurer ? 'Insurer is linked.' : 'Select the underwriting insurer.',
      severity: 'required',
    },
    mode === 'BROKER_COLLECTED'
      ? {
        key: 'broker_premium_paid',
        label: 'Broker-collected premium allocated',
        passed: outstanding <= 0 && totalPremium > 0 && brokerPaid >= totalPremium && hasReceipt,
        message: outstanding <= 0 && hasReceipt
          ? 'Broker-collected premium is allocated and receipted.'
          : `Broker-collected premium needs allocation and receipt. Outstanding KES ${outstanding.toLocaleString('en-KE', { maximumFractionDigits: 0 })}.`,
        severity: 'required',
      }
      : mode === 'DIRECT_TO_INSURER'
        ? {
          key: 'direct_insurer_payment_verified',
          label: 'Direct insurer payment verified',
          passed: hasVerifiedDirectPayment && directVerifiedAmount >= totalPremium && directPaymentsHaveReferences && directPaymentsHaveProof && hasCommissionAccounted,
          message: directPaymentIssues.length
            ? directPaymentIssues.join('; ') + '.'
            : 'Direct insurer payment is verified with insurer reference, proof/acknowledgement, and commission receivable.',
          severity: 'required',
        }
        : {
          key: 'mixed_premium_verified',
          label: 'Mixed premium allocation complete',
          passed: brokerPaid > 0 && hasReceipt && hasVerifiedDirectPayment && outstanding <= 0 && directPaymentsHaveReferences && hasCommissionAccounted,
          message: mixedPaymentIssues.length
            ? mixedPaymentIssues.join('; ') + '.'
            : 'Broker and direct-to-insurer portions are complete.',
          severity: 'required',
        },
    {
      key: 'commission_accounted',
      label: 'Commission calculated',
      passed: hasCommissionAccounted,
      message: hasCommissionAccounted
        ? 'Commission has been calculated and linked to the policy.'
        : 'Calculate commission before activation.',
      severity: 'required',
    },
    {
      key: 'accounting_posted',
      label: 'Accounting posted',
      passed: hasAccountingPosted,
      message: hasAccountingPosted
        ? 'Required financial posting is complete.'
        : 'Post or resolve queued accounting events before activation.',
      severity: 'required',
    },
    {
      key: 'onboarding_approved',
      label: 'Onboarding approval complete',
      passed: !policy.onboardingCase || policy.onboardingCase.status === 'APPROVED',
      message: !policy.onboardingCase
        ? 'No onboarding case is linked; activation can continue for direct policies.'
        : `Onboarding case ${policy.onboardingCase.caseNumber} is ${policy.onboardingCase.status}.`,
      severity: 'required',
    },
    {
      key: 'underwriter_policy_number',
      label: 'Underwriter policy number captured',
      passed: !!policy.insurerPolicyNumber || allowInternalActivation,
      message: policy.insurerPolicyNumber
        ? 'Underwriter policy number is captured.'
        : allowInternalActivation
          ? 'Admin setting allows internal-only activation.'
          : 'Enter the official underwriter policy number.',
      severity: 'required',
    },
    {
      key: 'policy_schedule',
      label: 'Policy schedule uploaded or generated',
      passed: hasSchedule,
      message: hasSchedule ? 'Policy schedule is available.' : 'Upload or generate the policy schedule.',
      severity: 'required',
    },
    {
      key: 'certificate',
      label: 'Certificate uploaded or generated',
      passed: hasCertificate,
      message: hasCertificate ? 'Certificate is available.' : 'Upload or generate the certificate.',
      severity: 'required',
    },
    {
      key: 'member_records',
      label: 'Member or dependant records captured',
      passed: !expectsGroupMembers || policy.members.length >= expectedMembers,
      message: !expectsGroupMembers
        ? 'No group member roster is required for this policy.'
        : `${policy.members.length} of ${expectedMembers} expected member records are attached.`,
      severity: 'required',
    },
  ];

  const missingRequired = checks.filter((check) => check.severity === 'required' && !check.passed);

  return {
    policyId: policy.id,
    policyNumber: policy.policyNumber,
    ready: missingRequired.length === 0,
    checks,
    missingRequired,
  };
}

// ─────────────────────────────────────────────────────────
// CREATE / UPDATE
// ─────────────────────────────────────────────────────────

export async function createPolicy(data: CreatePolicyInput, userId: string) {
  const policyNumber = await generatePolicyNumber();

  const premiumBreakdown = calculatePremium({
    basePremium: data.basePremium,
    trainingLevy: data.trainingLevy,
    pcifLevy: data.pcifLevy,
    stampDuty: data.stampDuty,
    policyFee: data.policyFee,
  } as any);

  const policy = await prisma.policy.create({
    data: {
      policyNumber,
      insurerPolicyNumber: data.insurerPolicyNumber ?? null,
      clientId: data.clientId,
      productId: data.productId,
      insurerId: data.insurerId,
      agentId: data.agentId ?? null,
      onboardingCaseId: data.onboardingCaseId ?? null,
      sourceLeadId: data.sourceLeadId ?? null,
      startDate: new Date(data.startDate),
      endDate: new Date(data.endDate),
      sumInsured: data.sumInsured ? data.sumInsured : null,
      basePremium: premiumBreakdown.basePremium,
      trainingLevy: data.trainingLevy ?? premiumBreakdown.trainingLevy,
      pcifLevy: data.pcifLevy ?? premiumBreakdown.pcifLevy,
      stampDuty: data.stampDuty ?? premiumBreakdown.stampDuty,
      policyFee: data.policyFee ?? premiumBreakdown.policyFee,
      totalPremium: premiumBreakdown.totalPremium,
      outstandingAmount: premiumBreakdown.totalPremium,
      totalPremiumAmount: premiumBreakdown.totalPremium,
      outstandingPremiumAmount: premiumBreakdown.totalPremium,
      premiumCollectionMode: (data as any).premiumCollectionMode ?? 'BROKER_COLLECTED',
      premiumPaidTo: (data as any).premiumCollectionMode === 'DIRECT_TO_INSURER'
        ? 'INSURER'
        : (data as any).premiumCollectionMode === 'MIXED'
          ? 'BOTH'
          : 'BROKER',
      paymentFrequency: data.paymentFrequency as any,
      notes: data.notes ?? null,
      status: 'DRAFT',
      underwritingStatus: 'PENDING',
      createdById: userId,
    },
    include: {
      client: { select: { id: true, firstName: true, lastName: true, companyName: true, tradingName: true, type: true } },
      product: { select: { id: true, name: true, code: true } },
      insurer: { select: { id: true, name: true, shortName: true } },
    },
  });

  await logPolicyEvent(policy.id, 'CREATED', `Policy ${policyNumber} created`, { status: 'DRAFT' }, userId);
  await prisma.task.create({
    data: {
      title: 'Follow up with underwriter for official policy number and schedule',
      description: `Policy ${policyNumber} needs the insurer policy number and policy schedule/certificate before activation.`,
      category: 'POLICY_UNDERWRITING',
      dueDate: new Date(Date.now() + 3 * 86400000),
      priority: 'NORMAL',
      clientId: policy.clientId,
      policyId: policy.id,
      insurerId: policy.insurerId,
      agentId: policy.agentId,
      assignedToId: userId,
      createdById: userId,
    },
  }).catch(() => null);

  return attachClientFullName(policy);
}

export async function updatePolicy(id: string, data: UpdatePolicyInput, userId: string) {
  const existing = await prisma.policy.findFirst({ where: { id, deletedAt: null } });
  if (!existing) throw new Error('Policy not found');

  if (['CANCELLED', 'EXPIRED', 'RENEWED'].includes(existing.status)) {
    throw new Error(`Cannot update a policy with status ${existing.status}`);
  }

  const nextStart = data.startDate ? new Date(data.startDate) : existing.startDate;
  const nextEnd = data.endDate ? new Date(data.endDate) : existing.endDate;
  if (nextEnd <= nextStart) {
    throw new Error('Cannot save policy because cover end date must be after cover start date');
  }

  const requestedCollectionMode = (data as any).premiumCollectionMode as string | undefined;
  if (requestedCollectionMode && requestedCollectionMode !== existing.premiumCollectionMode) {
    const [brokerAllocations, directPayments] = await Promise.all([
      prisma.paymentAllocation.count({ where: { policyId: id, reversedAt: null } }),
      prisma.directInsurerPayment.count({ where: { policyId: id, deletedAt: null } }),
    ]);
    const hasPaymentHistory =
      brokerAllocations > 0 ||
      directPayments > 0 ||
      Number(existing.brokerCollectedAmount) > 0 ||
      Number(existing.directToInsurerAmount) > 0 ||
      Number(existing.paidAmount) > 0;
    if (hasPaymentHistory) {
      throw new Error('Cannot change premium collection mode after payment activity exists. Reverse or correct the payment record first.');
    }
  }

  let premiumFields: any = {};
  if (data.basePremium !== undefined) {
    const newBase = data.basePremium;
    const breakdown = calculatePremium({
      basePremium: newBase,
      policyFee: data.policyFee ?? Number(existing.policyFee),
    });
    premiumFields = {
      basePremium: breakdown.basePremium,
      trainingLevy: data.trainingLevy ?? breakdown.trainingLevy,
      pcifLevy: data.pcifLevy ?? breakdown.pcifLevy,
      stampDuty: data.stampDuty ?? breakdown.stampDuty,
      policyFee: data.policyFee ?? breakdown.policyFee,
      totalPremium: breakdown.totalPremium,
      outstandingAmount: Math.max(0, breakdown.totalPremium - Number(existing.paidAmount)),
      totalPremiumAmount: breakdown.totalPremium,
      outstandingPremiumAmount: Math.max(0, breakdown.totalPremium - Number(existing.paidAmount)),
    };
  }

  const updated = await prisma.policy.update({
    where: { id },
    data: {
      ...(data.insurerPolicyNumber !== undefined && { insurerPolicyNumber: data.insurerPolicyNumber }),
      ...(data.agentId !== undefined && { agentId: data.agentId }),
      ...(data.startDate && { startDate: new Date(data.startDate) }),
      ...(data.endDate && { endDate: new Date(data.endDate) }),
      ...(data.sumInsured !== undefined && { sumInsured: data.sumInsured }),
      ...(data.paymentFrequency && { paymentFrequency: data.paymentFrequency as any }),
      ...((data as any).premiumCollectionMode && {
        premiumCollectionMode: (data as any).premiumCollectionMode,
        premiumPaidTo: (data as any).premiumCollectionMode === 'DIRECT_TO_INSURER'
          ? 'INSURER'
          : (data as any).premiumCollectionMode === 'MIXED'
            ? 'BOTH'
            : 'BROKER',
      }),
      ...(data.notes !== undefined && { notes: data.notes }),
      ...premiumFields,
    },
  });

  await logPolicyEvent(id, 'UPDATED', 'Policy details updated', { fields: Object.keys(data) }, userId);

  return updated;
}

// ─────────────────────────────────────────────────────────
// STATUS TRANSITIONS
// ─────────────────────────────────────────────────────────

export async function activatePolicy(id: string, userId: string) {
  const policy = await prisma.policy.findFirst({ where: { id, deletedAt: null } });
  if (!policy) throw new Error('Policy not found');

  const allowedStatuses = ['DRAFT', 'PENDING_PAYMENT', 'PENDING_UNDERWRITING'];
  if (!allowedStatuses.includes(policy.status)) {
    throw new Error(`Policy cannot be activated from status ${policy.status}`);
  }

  const readiness = await getPolicyActivationReadiness(id);
  if (!readiness.ready) {
    await prisma.$transaction((tx) => ensureWorkflowTask(tx, {
        title: 'Complete policy activation requirements.',
        description: readiness.missingRequired.map((check) => `${check.label}: ${check.message}`).join('\n'),
        category: 'POLICY_ACTIVATION',
        dueDate: new Date(Date.now() + 3 * 86400000),
        clientId: policy.clientId,
        policyId: policy.id,
        onboardingCaseId: policy.onboardingCaseId,
        assignedToId: userId,
        createdById: userId,
        dedupeBy: ['title', 'category', 'policyId'],
      })).catch(() => null);

    const missing = readiness.missingRequired.map((check) => check.label).join(', ');
    throw new Error(`Activation blocked. Complete these requirements first: ${missing}`);
  }

  const updated = await prisma.policy.update({
    where: { id },
    data: { status: 'ACTIVE', underwritingStatus: 'APPROVED' },
  });

  await logPolicyEvent(id, 'ACTIVATED', `Policy ${policy.policyNumber} activated`, { previousStatus: policy.status }, userId);

  return updated;
}

export async function suspendPolicy(id: string, reason: string, userId: string) {
  const policy = await prisma.policy.findFirst({ where: { id, deletedAt: null } });
  if (!policy) throw new Error('Policy not found');

  if (policy.status !== 'ACTIVE') {
    throw new Error(`Only ACTIVE policies can be suspended. Current status: ${policy.status}`);
  }

  const updated = await prisma.policy.update({
    where: { id },
    data: { status: 'SUSPENDED', suspensionDate: new Date(), suspensionReason: reason },
  });

  await logPolicyEvent(id, 'SUSPENDED', `Policy suspended: ${reason}`, { reason }, userId);

  return updated;
}

export async function reinstatePolicy(id: string, userId: string) {
  const policy = await prisma.policy.findFirst({ where: { id, deletedAt: null } });
  if (!policy) throw new Error('Policy not found');

  if (policy.status !== 'SUSPENDED') {
    throw new Error(`Only SUSPENDED policies can be reinstated. Current status: ${policy.status}`);
  }

  const updated = await prisma.policy.update({
    where: { id },
    data: { status: 'ACTIVE', reinstatedDate: new Date(), suspensionDate: null, suspensionReason: null },
  });

  await logPolicyEvent(id, 'REINSTATED', `Policy ${policy.policyNumber} reinstated`, {}, userId);

  return updated;
}

export async function cancelPolicy(id: string, reason: string, userId: string) {
  const policy = await prisma.policy.findFirst({ where: { id, deletedAt: null } });
  if (!policy) throw new Error('Policy not found');

  if (['CANCELLED', 'RENEWED', 'EXPIRED'].includes(policy.status)) {
    throw new Error(`Policy is already ${policy.status}`);
  }

  const updated = await prisma.policy.update({
    where: { id },
    data: { status: 'CANCELLED', cancellationDate: new Date(), cancellationReason: reason },
  });

  await logPolicyEvent(id, 'CANCELLED', `Policy cancelled: ${reason}`, { reason }, userId);

  return updated;
}

export async function softDeletePolicy(id: string, userId: string) {
  const policy = await prisma.policy.findFirst({ where: { id, deletedAt: null } });
  if (!policy) throw new Error('Policy not found');

  if (policy.status === 'ACTIVE') {
    throw new Error('Cannot delete an active policy. Cancel it first.');
  }

  await prisma.policy.update({ where: { id }, data: { deletedAt: new Date() } });
  await logPolicyEvent(id, 'DELETED', `Policy ${policy.policyNumber} deleted`, {}, userId);
}

// ─────────────────────────────────────────────────────────
// MEMBERS
// ─────────────────────────────────────────────────────────

export async function listMembers(policyId: string) {
  await requirePolicy(policyId);
  return prisma.policyMember.findMany({
    where: { policyId },
    orderBy: [{ status: 'asc' }, { relationship: 'asc' }, { name: 'asc' }],
  });
}

export async function addMember(policyId: string, data: CreateMemberInput, userId: string) {
  const policy = await requirePolicy(policyId);

  const member = await prisma.policyMember.create({
    data: {
      policyId,
      name: data.name,
      dateOfBirth: data.dateOfBirth ? new Date(data.dateOfBirth) : null,
      gender: data.gender ?? null,
      idNumber: data.idNumber ?? null,
      relationship: data.relationship,
      coverageLevel: data.coverageLevel ?? null,
      effectiveDate: new Date(data.effectiveDate),
      terminationDate: data.terminationDate ? new Date(data.terminationDate) : null,
      premiumAmount: data.premiumAmount ?? null,
      status: data.status ?? 'ACTIVE',
    },
  });

  await logPolicyEvent(policyId, 'MEMBER_ADDED', `Member ${data.name} added (${data.relationship})`, { memberId: member.id }, userId);

  return member;
}

export async function updateMember(policyId: string, memberId: string, data: UpdateMemberInput, userId: string) {
  await requirePolicy(policyId);

  const member = await prisma.policyMember.findFirst({ where: { id: memberId, policyId } });
  if (!member) throw new Error('Member not found');

  const updated = await prisma.policyMember.update({
    where: { id: memberId },
    data: {
      ...(data.name && { name: data.name }),
      ...(data.dateOfBirth !== undefined && { dateOfBirth: data.dateOfBirth ? new Date(data.dateOfBirth) : null }),
      ...(data.gender !== undefined && { gender: data.gender }),
      ...(data.idNumber !== undefined && { idNumber: data.idNumber }),
      ...(data.relationship && { relationship: data.relationship }),
      ...(data.coverageLevel !== undefined && { coverageLevel: data.coverageLevel }),
      ...(data.effectiveDate && { effectiveDate: new Date(data.effectiveDate) }),
      ...(data.terminationDate !== undefined && { terminationDate: data.terminationDate ? new Date(data.terminationDate) : null }),
      ...(data.premiumAmount !== undefined && { premiumAmount: data.premiumAmount }),
      ...(data.status && { status: data.status }),
    },
  });

  await logPolicyEvent(policyId, 'MEMBER_UPDATED', `Member ${member.name} updated`, { memberId }, userId);

  return updated;
}

export async function removeMember(policyId: string, memberId: string, userId: string) {
  await requirePolicy(policyId);

  const member = await prisma.policyMember.findFirst({ where: { id: memberId, policyId } });
  if (!member) throw new Error('Member not found');

  await prisma.policyMember.update({
    where: { id: memberId },
    data: { status: 'TERMINATED', terminationDate: new Date() },
  });

  await logPolicyEvent(policyId, 'MEMBER_REMOVED', `Member ${member.name} terminated`, { memberId }, userId);
}

// ─────────────────────────────────────────────────────────
// ENDORSEMENTS
// ─────────────────────────────────────────────────────────

export async function listEndorsements(policyId: string) {
  await requirePolicy(policyId);
  return prisma.policyEndorsement.findMany({
    where: { policyId },
    orderBy: { createdAt: 'desc' },
  });
}

export async function createEndorsement(policyId: string, data: CreateEndorsementInput, userId: string) {
  const policy = await requirePolicy(policyId);
  const endorsementNumber = await generateEndorsementNumber(policyId);

  const endorsement = await prisma.policyEndorsement.create({
    data: {
      policyId,
      endorsementNumber,
      type: data.type as any,
      effectiveDate: new Date(data.effectiveDate),
      description: data.description,
      beforeValues: data.beforeValues as any ?? null,
      afterValues: data.afterValues as any ?? null,
      premiumChange: data.premiumChange ?? 0,
      notes: data.notes ?? null,
      status: 'PENDING',
      createdById: userId,
    },
  });

  await logPolicyEvent(
    policyId,
    'ENDORSEMENT_CREATED',
    `Endorsement ${endorsementNumber} created (${data.type})`,
    { endorsementId: endorsement.id, type: data.type },
    userId
  );

  return endorsement;
}

export async function approveEndorsement(policyId: string, endorsementId: string, userId: string) {
  const endorsement = await prisma.policyEndorsement.findFirst({
    where: { id: endorsementId, policyId },
  });
  if (!endorsement) throw new Error('Endorsement not found');
  if (endorsement.status !== 'PENDING') throw new Error('Only PENDING endorsements can be approved');

  const policy = await requirePolicy(policyId);

  const updated = await prisma.policyEndorsement.update({
    where: { id: endorsementId },
    data: { status: 'APPROVED', approvedById: userId, approvedAt: new Date() },
  });

  // Apply premium change if any
  if (Number(endorsement.premiumChange) !== 0) {
    const newTotal = Number(policy.totalPremium) + Number(endorsement.premiumChange);
    const newOutstanding = Math.max(0, Number(policy.outstandingAmount) + Number(endorsement.premiumChange));
    await prisma.policy.update({
      where: { id: policyId },
      data: { totalPremium: newTotal, outstandingAmount: newOutstanding },
    });
  }

  await logPolicyEvent(policyId, 'ENDORSEMENT_APPROVED', `Endorsement ${endorsement.endorsementNumber} approved`, { endorsementId }, userId);

  return updated;
}

export async function rejectEndorsement(policyId: string, endorsementId: string, reason: string, userId: string) {
  const endorsement = await prisma.policyEndorsement.findFirst({
    where: { id: endorsementId, policyId },
  });
  if (!endorsement) throw new Error('Endorsement not found');
  if (endorsement.status !== 'PENDING') throw new Error('Only PENDING endorsements can be rejected');

  const updated = await prisma.policyEndorsement.update({
    where: { id: endorsementId },
    data: { status: 'REJECTED', notes: reason },
  });

  await logPolicyEvent(policyId, 'ENDORSEMENT_REJECTED', `Endorsement ${endorsement.endorsementNumber} rejected: ${reason}`, { endorsementId, reason }, userId);

  return updated;
}

// ─────────────────────────────────────────────────────────
// DOCUMENTS
// ─────────────────────────────────────────────────────────

export async function listDocuments(policyId: string) {
  await requirePolicy(policyId);
  return prisma.policyDocument.findMany({
    where: { policyId },
    orderBy: { createdAt: 'desc' },
  });
}

export async function createDocument(
  policyId: string,
  data: { type: string; name: string; fileUrl: string; fileSize: number; mimeType: string },
  userId: string
) {
  await requirePolicy(policyId);

  const existing = await prisma.policyDocument.findFirst({
    where: { policyId, type: data.type },
    orderBy: { version: 'desc' },
  });

  const version = existing ? existing.version + 1 : 1;

  const doc = await prisma.policyDocument.create({
    data: {
      policyId,
      type: data.type,
      name: data.name,
      fileUrl: data.fileUrl,
      fileSize: data.fileSize,
      mimeType: data.mimeType,
      version,
      createdById: userId,
    },
  });

  await logPolicyEvent(policyId, 'DOCUMENT_UPLOADED', `Document "${data.name}" uploaded (${data.type})`, { documentId: doc.id, type: data.type }, userId);

  return doc;
}

export async function generateDocument(policyId: string, type: string, userId: string) {
  const policy = await prisma.policy.findFirst({
    where: { id: policyId, deletedAt: null },
    include: {
      client: { select: { id: true, firstName: true, lastName: true, companyName: true, tradingName: true, type: true, email: true } },
      product: { select: { id: true, name: true, code: true } },
      insurer: { select: { id: true, name: true, shortName: true } },
    },
  });
  if (!policy) throw new Error('Policy not found');

  const docName = buildDocumentName(attachClientFullName(policy), type);

  const existing = await prisma.policyDocument.findFirst({
    where: { policyId, type },
    orderBy: { version: 'desc' },
  });
  const version = existing ? existing.version + 1 : 1;

  const doc = await prisma.policyDocument.create({
    data: {
      policyId,
      type,
      name: docName,
      fileUrl: '', // Placeholder; real generation would produce a signed URL
      fileSize: 0,
      mimeType: 'application/pdf',
      version,
      generatedAt: new Date(),
      createdById: userId,
    },
  });

  await logPolicyEvent(policyId, 'DOCUMENT_GENERATED', `Document "${docName}" generated`, { documentId: doc.id, type }, userId);

  return doc;
}

export async function deleteDocument(policyId: string, documentId: string, userId: string) {
  const doc = await prisma.policyDocument.findFirst({ where: { id: documentId, policyId } });
  if (!doc) throw new Error('Document not found');

  await prisma.policyDocument.delete({ where: { id: documentId } });
  await logPolicyEvent(policyId, 'DOCUMENT_DELETED', `Document "${doc.name}" deleted`, { documentId }, userId);
}

// ─────────────────────────────────────────────────────────
// EVENTS / HISTORY
// ─────────────────────────────────────────────────────────

export async function listEvents(policyId: string) {
  await requirePolicy(policyId);
  return prisma.policyEvent.findMany({
    where: { policyId },
    orderBy: { createdAt: 'desc' },
  });
}

export async function logPolicyEvent(
  policyId: string,
  eventType: string,
  description: string,
  metadata?: any,
  userId?: string,
  ipAddress?: string
) {
  return prisma.policyEvent.create({
    data: {
      policyId,
      eventType,
      description,
      metadata: metadata ?? null,
      userId: userId ?? null,
      ipAddress: ipAddress ?? null,
    },
  });
}

// ─────────────────────────────────────────────────────────
// RENEWALS
// ─────────────────────────────────────────────────────────

export async function createRenewal(originalPolicyId: string, data: CreateRenewalInput, userId: string) {
  const original = await prisma.policy.findFirst({
    where: { id: originalPolicyId, deletedAt: null },
    include: { renewedTo: { select: { id: true } } },
  });
  if (!original) throw new Error('Original policy not found');

  if (!['ACTIVE', 'EXPIRED'].includes(original.status)) {
    throw new Error(`Only ACTIVE or EXPIRED policies can be renewed. Current status: ${original.status}`);
  }

  if (original.renewedTo) {
    throw new Error('This policy has already been renewed');
  }

  const policyNumber = await generatePolicyNumber();
  const premiumBreakdown = calculatePremium({
    basePremium: data.basePremium,
    policyFee: data.policyFee,
  });

  const renewal = await prisma.$transaction(async (tx) => {
    const newPolicy = await tx.policy.create({
      data: {
        policyNumber,
        insurerPolicyNumber: original.insurerPolicyNumber,
        clientId: original.clientId,
        productId: original.productId,
        insurerId: original.insurerId,
        agentId: original.agentId,
        startDate: new Date(data.startDate),
        endDate: new Date(data.endDate),
        sumInsured: data.sumInsured ?? original.sumInsured,
        basePremium: premiumBreakdown.basePremium,
        trainingLevy: data.trainingLevy ?? premiumBreakdown.trainingLevy,
        pcifLevy: data.pcifLevy ?? premiumBreakdown.pcifLevy,
        stampDuty: data.stampDuty ?? premiumBreakdown.stampDuty,
        policyFee: data.policyFee ?? premiumBreakdown.policyFee,
        totalPremium: premiumBreakdown.totalPremium,
        outstandingAmount: premiumBreakdown.totalPremium,
        paymentFrequency: (data.paymentFrequency as any) ?? original.paymentFrequency,
        notes: data.notes ?? null,
        status: 'DRAFT',
        underwritingStatus: 'PENDING',
        renewedFromId: originalPolicyId,
        createdById: userId,
      },
    });

    await tx.policy.update({
      where: { id: originalPolicyId },
      data: { status: 'RENEWED' },
    });

    return newPolicy;
  });

  await logPolicyEvent(originalPolicyId, 'RENEWED', `Policy renewed as ${policyNumber}`, { renewalPolicyId: renewal.id }, userId);
  await logPolicyEvent(renewal.id, 'CREATED', `Renewal policy ${policyNumber} created from ${original.policyNumber}`, { originalPolicyId }, userId);

  return renewal;
}

export async function listRenewalsDue(req: AuthRequest) {
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(100, parseInt(req.query.limit as string) || 20);
  const skip = (page - 1) * limit;

  const daysAhead = parseInt(req.query.daysAhead as string) || 30;
  const insurerId = req.query.insurerId as string | undefined;
  const agentId = req.query.agentId as string | undefined;

  const now = new Date();
  const threshold = new Date(now.getTime() + daysAhead * 86400000);

  const where: any = {
    deletedAt: null,
    status: 'ACTIVE',
    endDate: { gte: now, lte: threshold },
    renewedTo: { is: null },
    ...(insurerId && { insurerId }),
    ...(agentId && { agentId }),
  };

  const [policies, total] = await Promise.all([
    prisma.policy.findMany({
      where,
      skip,
      take: limit,
      orderBy: { endDate: 'asc' },
      include: {
        client: { select: { id: true, firstName: true, lastName: true, companyName: true, tradingName: true, type: true, email: true, phone: true } },
        product: { select: { id: true, name: true, code: true } },
        insurer: { select: { id: true, name: true, shortName: true } },
        agent: { select: { id: true, firstName: true, lastName: true } },
      },
    }),
    prisma.policy.count({ where }),
  ]);

  return { policies: policies.map(attachClientFullName), total, page, limit };
}

// ─────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────

async function requirePolicy(policyId: string) {
  const policy = await prisma.policy.findFirst({ where: { id: policyId, deletedAt: null } });
  if (!policy) throw new Error('Policy not found');
  return policy;
}

function buildDocumentName(policy: any, type: string): string {
  const clientName = policy.client?.fullName ?? policy.client?.companyName ?? policy.client?.tradingName ?? 'Client';
  const policyNumber = policy.policyNumber;
  const date = new Date().toISOString().split('T')[0];

  const typeLabels: Record<string, string> = {
    POLICY_SCHEDULE: 'Policy Schedule',
    DEBIT_NOTE: 'Debit Note',
    CERTIFICATE: 'Certificate of Insurance',
    ENDORSEMENT_NOTICE: 'Endorsement Notice',
    TERMS_AND_CONDITIONS: 'Terms and Conditions',
  };

  const label = typeLabels[type] ?? type;
  return `${label} - ${policyNumber} - ${clientName} - ${date}`;
}
