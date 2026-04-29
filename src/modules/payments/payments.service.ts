import { Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { prisma } from '../../config/database';
import { AuthRequest } from '../../types/express';
import { addJob, QUEUE_NAMES } from '../../config/queues';
import { generatePaymentAcknowledgementArtifact, generateReceiptArtifact } from './receipt.service';
import { postJournal, SYSTEM_ACCOUNTS } from '../accounting/postingEngine.service';
import { calculateCommission } from '../commissions/commissions.service';
import {
  AllocatePaymentInput,
  CreateInvoiceInput,
  PaymentAllocationInput,
  RecordDirectInsurerPaymentInput,
  RecordPaymentInput,
  VerifyDirectInsurerPaymentInput,
} from './payments.validation';

type Tx = Prisma.TransactionClient;

const PAYMENT_INCLUDE = {
  client: {
    select: {
      id: true,
      clientNumber: true,
      type: true,
      firstName: true,
      lastName: true,
      companyName: true,
      tradingName: true,
      email: true,
      phone: true,
      physicalAddress: true,
    },
  },
  allocations: {
    include: {
      policy: { select: { id: true, policyNumber: true, totalPremium: true, paidAmount: true, outstandingAmount: true, status: true } },
      invoice: { select: { id: true, invoiceNumber: true, totalAmount: true, paidAmount: true, balanceDue: true, status: true } },
    },
    orderBy: { createdAt: 'asc' as const },
  },
  receipt: true,
  bankAccount: { select: { id: true, accountName: true, accountNumber: true, bankName: true } },
  mpesaAccount: { select: { id: true, accountName: true, shortCode: true } },
  mpesaTransactions: true,
} satisfies Prisma.PaymentInclude;

function decimal(value: number | string | Decimal): Decimal {
  return value instanceof Decimal ? value : new Decimal(value);
}

function money(value: number | string | Decimal): string {
  const amount = value instanceof Decimal ? value.toNumber() : Number(value);
  return new Intl.NumberFormat('en-KE', {
    style: 'currency',
    currency: 'KES',
    maximumFractionDigits: 2,
  }).format(amount);
}

function clientDisplayName(client: {
  firstName?: string | null;
  lastName?: string | null;
  companyName?: string | null;
  tradingName?: string | null;
}): string {
  const person = `${client.firstName ?? ''} ${client.lastName ?? ''}`.trim();
  return person || client.companyName || client.tradingName || 'Client';
}

function amountInWords(amount: Decimal): string {
  const value = amount.toFixed(2);
  return `Kenya Shillings ${value} only`;
}

async function generateSequentialNumber(
  tx: Tx,
  model: 'payment' | 'receipt' | 'invoice' | 'journalEntry' | 'financeTransaction',
  field: 'paymentNumber' | 'receiptNumber' | 'invoiceNumber' | 'entryNumber' | 'transactionNumber',
  prefix: string,
): Promise<string> {
  const year = new Date().getFullYear();
  const startsWith = `${prefix}-${year}-`;
  const count = await (tx[model] as any).count({ where: { [field]: { startsWith } } });
  return `${startsWith}${String(count + 1).padStart(6, '0')}`;
}

async function createFinanceTransactionFromBrokerPayment(tx: Tx, paymentId: string, journalEntryId: string, userId: string): Promise<void> {
  const payment = await tx.payment.findUniqueOrThrow({
    where: { id: paymentId },
    include: { allocations: true },
  });
  const activeAllocations = payment.allocations.filter((allocation) => !allocation.reversedAt);
  const linkedPolicyIds = activeAllocations.map((allocation) => allocation.policyId).filter(Boolean) as string[];
  const linkedInvoiceIds = activeAllocations.map((allocation) => allocation.invoiceId).filter(Boolean) as string[];
  await tx.financeTransaction.create({
    data: {
      transactionNumber: await generateSequentialNumber(tx, 'financeTransaction', 'transactionNumber', 'FTX'),
      type: 'BROKER_PREMIUM_PAYMENT',
      status: 'POSTED',
      transactionDate: payment.paymentDate,
      description: `Broker premium payment ${payment.paymentNumber}`,
      reference: payment.transactionCode ?? payment.reference ?? payment.paymentNumber,
      amount: payment.amount,
      currency: payment.currency,
      direction: 'INFLOW',
      bankAccountId: payment.bankAccountId ?? null,
      mpesaAccountId: payment.mpesaAccountId ?? null,
      journalEntryId,
      paymentId: payment.id,
      clientId: payment.clientId,
      policyId: linkedPolicyIds[0] ?? null,
      notes: linkedInvoiceIds.length > 0
        ? `Linked invoices: ${linkedInvoiceIds.join(',')}`
        : linkedPolicyIds.length > 1
          ? `Linked policies: ${linkedPolicyIds.join(',')}`
          : null,
      createdById: userId,
    },
  });
  if (payment.bankAccountId) {
    await tx.bankAccount.update({
      where: { id: payment.bankAccountId },
      data: { currentBalance: { increment: payment.amount } },
    });
  }
  if (payment.mpesaAccountId) {
    await tx.mpesaAccount.update({
      where: { id: payment.mpesaAccountId },
      data: { currentBalance: { increment: payment.amount } },
    });
  }
}

async function logPolicyEvent(
  tx: Tx,
  policyId: string,
  eventType: string,
  description: string,
  metadata: Record<string, unknown>,
  userId?: string,
): Promise<void> {
  await tx.policyEvent.create({
    data: {
      policyId,
      eventType,
      description,
      metadata: metadata as Prisma.InputJsonValue,
      userId: userId ?? null,
    },
  });
}

async function getPaymentAllocatedAmount(tx: Tx, paymentId: string): Promise<Decimal> {
  const aggregate = await tx.paymentAllocation.aggregate({
    where: { paymentId, reversedAt: null },
    _sum: { amount: true },
  });
  return aggregate._sum.amount ?? new Decimal(0);
}

async function assertAllocationTargets(
  tx: Tx,
  clientId: string,
  allocations: PaymentAllocationInput[],
): Promise<void> {
  for (const allocation of allocations) {
    if (allocation.policyId) {
      const policy = await tx.policy.findFirst({
        where: { id: allocation.policyId, clientId, deletedAt: null },
        select: { id: true, outstandingAmount: true, policyNumber: true, status: true },
      });
      if (!policy) throw new Error('Policy allocation target not found for this client');
      if (decimal(allocation.amount).gt(policy.outstandingAmount)) {
        throw new Error(`Allocation exceeds outstanding balance for policy ${policy.policyNumber}`);
      }
    }

    if (allocation.invoiceId) {
      const invoice = await tx.invoice.findFirst({
        where: { id: allocation.invoiceId, clientId, deletedAt: null },
        select: { id: true, balanceDue: true, invoiceNumber: true, status: true },
      });
      if (!invoice) throw new Error('Invoice allocation target not found for this client');
      if (['CANCELLED', 'VOID'].includes(invoice.status)) {
        throw new Error(`Cannot allocate payment to ${invoice.status.toLowerCase()} invoice ${invoice.invoiceNumber}`);
      }
      if (decimal(allocation.amount).gt(invoice.balanceDue)) {
        throw new Error(`Allocation exceeds balance due for invoice ${invoice.invoiceNumber}`);
      }
    }
  }
}

async function applyAllocation(
  tx: Tx,
  paymentId: string,
  clientId: string,
  allocation: PaymentAllocationInput,
  userId: string,
): Promise<void> {
  const amount = decimal(allocation.amount);

  await tx.paymentAllocation.create({
    data: {
      paymentId,
      policyId: allocation.policyId ?? null,
      invoiceId: allocation.invoiceId ?? null,
      amount,
      notes: allocation.notes ?? null,
      createdById: userId,
    },
  });

  if (allocation.policyId) {
    const policy = await tx.policy.update({
      where: { id: allocation.policyId },
      data: {
        paidAmount: { increment: amount },
        outstandingAmount: { decrement: amount },
        brokerCollectedAmount: { increment: amount },
        outstandingPremiumAmount: { decrement: amount },
      },
      select: {
        id: true,
        policyNumber: true,
        paidAmount: true,
        outstandingAmount: true,
        status: true,
      },
    });

    if (decimal(policy.outstandingAmount).lte(0) && ['DRAFT', 'PENDING_PAYMENT', 'PENDING_UNDERWRITING'].includes(policy.status)) {
      await tx.policy.update({
        where: { id: policy.id },
        data: { status: 'ACTIVE', underwritingStatus: 'APPROVED', outstandingAmount: new Decimal(0) },
      });
    } else if (decimal(policy.outstandingAmount).gt(0) && policy.status === 'DRAFT') {
      await tx.policy.update({ where: { id: policy.id }, data: { status: 'PENDING_PAYMENT' } });
    }

    await logPolicyEvent(
      tx,
      policy.id,
      'PAYMENT_ALLOCATED',
      `Payment allocation of ${money(amount)} recorded`,
      { paymentId, amount: amount.toFixed(2), clientId },
      userId,
    );
  }

  if (allocation.invoiceId) {
    const invoice = await tx.invoice.update({
      where: { id: allocation.invoiceId },
      data: {
        paidAmount: { increment: amount },
        balanceDue: { decrement: amount },
      },
      select: { id: true, totalAmount: true, paidAmount: true, balanceDue: true },
    });

    const balanceDue = decimal(invoice.balanceDue);
    await tx.invoice.update({
      where: { id: invoice.id },
      data: {
        balanceDue: balanceDue.lt(0) ? new Decimal(0) : balanceDue,
        status: balanceDue.lte(0) ? 'PAID' : 'PARTIALLY_PAID',
      },
    });
  }
}

async function updatePaymentStatus(tx: Tx, paymentId: string): Promise<void> {
  const payment = await tx.payment.findUniqueOrThrow({
    where: { id: paymentId },
    select: { amount: true, status: true },
  });
  if (['REVERSED', 'REFUNDED', 'FAILED'].includes(payment.status)) return;

  const allocated = await getPaymentAllocatedAmount(tx, paymentId);
  const status = allocated.gte(payment.amount)
    ? 'COMPLETED'
    : allocated.gt(0)
      ? 'ALLOCATED'
      : 'VERIFIED';

  await tx.payment.update({ where: { id: paymentId }, data: { status: status as any } });
}

async function createReceiptForPayment(tx: Tx, paymentId: string, userId: string): Promise<void> {
  const payment = await tx.payment.findUniqueOrThrow({
    where: { id: paymentId },
    include: PAYMENT_INCLUDE,
  });

  const receiptNumber = await generateSequentialNumber(tx, 'receipt', 'receiptNumber', 'RCT');
  const clientName = clientDisplayName(payment.client);
  const activeAllocations = payment.allocations.filter((allocation) => !allocation.reversedAt);
  const particulars = activeAllocations.length
    ? activeAllocations
      .map((allocation) => allocation.policy?.policyNumber ?? allocation.invoice?.invoiceNumber ?? 'Unallocated premium')
      .join(', ')
    : 'Premium payment received';

  const artifact = await generateReceiptArtifact({
    receiptNumber,
    paymentNumber: payment.paymentNumber,
    clientName,
    clientAddress: payment.client.physicalAddress,
    amount: money(payment.amount),
    amountInWords: amountInWords(payment.amount),
    particulars,
    paymentMethod: payment.method,
    reference: payment.transactionCode ?? payment.reference,
    issuedAt: new Date(),
    allocations: activeAllocations.map((allocation) => ({
      policyNumber: allocation.policy?.policyNumber,
      invoiceNumber: allocation.invoice?.invoiceNumber,
      amount: money(allocation.amount),
    })),
  });

  const receipt = await tx.receipt.create({
    data: {
      receiptNumber,
      paymentId,
      clientName,
      clientAddress: payment.client.physicalAddress ?? null,
      amount: payment.amount,
      amountInWords: amountInWords(payment.amount),
      particulars,
      fileUrl: artifact.fileUrl,
      fileSize: artifact.fileSize,
      mimeType: artifact.mimeType,
      issuedById: userId,
    },
  });

  const document = await tx.document.create({
    data: {
      entityType: 'RECEIPT',
      entityId: receipt.id,
      clientId: payment.clientId,
      type: 'RECEIPT',
      category: 'PAYMENTS',
      name: `Receipt ${receiptNumber}`,
      description: `Receipt for payment ${payment.paymentNumber}`,
      fileUrl: artifact.fileUrl,
      fileSize: artifact.fileSize,
      mimeType: artifact.mimeType,
      tags: ['receipt', 'payment', payment.paymentNumber],
      createdById: userId,
    },
  });

  await tx.receipt.update({ where: { id: receipt.id }, data: { documentId: document.id } });
}

async function createPaymentJournalEntry(tx: Tx, paymentId: string, userId: string): Promise<void> {
  const payment = await tx.payment.findUniqueOrThrow({
    where: { id: paymentId },
    include: { allocations: true },
  });
  const accountCode = payment.method === 'MPESA' ? SYSTEM_ACCOUNTS.MPESA_TRUST : SYSTEM_ACCOUNTS.BANK_TRUST;

  await postJournal(tx, {
    event: 'BROKER_PREMIUM_RECEIVED',
    entryDate: payment.paymentDate,
    description: `Broker-collected premium ${payment.paymentNumber}`,
    reference: payment.transactionCode ?? payment.reference ?? payment.paymentNumber,
    source: {
      paymentId,
      clientId: payment.clientId,
      policyId: payment.allocations.find((allocation) => allocation.policyId)?.policyId ?? undefined,
    },
    userId,
    lines: [
      { accountCode, debit: payment.amount, description: 'Premium cash received into trust account' },
      { accountCode: SYSTEM_ACCOUNTS.INSURER_PAYABLE, credit: payment.amount, description: 'Premium payable to insurer' },
    ],
  });
}

export async function recordBrokerPaymentInTransaction(
  tx: Tx,
  data: RecordPaymentInput,
  userId: string,
): Promise<string> {
  const client = await tx.client.findFirst({
    where: { id: data.clientId, deletedAt: null },
    select: { id: true },
  });
  if (!client) throw new Error('Client not found');

  const allocations = data.allocations ?? [];
  const allocationTotal = allocations.reduce((sum, allocation) => sum.plus(allocation.amount), new Decimal(0));
  const paymentAmount = decimal(data.amount);
  if (allocationTotal.gt(paymentAmount)) {
    throw new Error('Allocated amount cannot exceed payment amount');
  }

  await assertAllocationTargets(tx, data.clientId, allocations);

  const paymentNumber = await generateSequentialNumber(tx, 'payment', 'paymentNumber', 'PAY');
  const payment = await tx.payment.create({
    data: {
      paymentNumber,
      clientId: data.clientId,
      amount: paymentAmount,
      currency: data.currency,
      premiumCollectionMode: data.premiumCollectionMode ?? 'BROKER_COLLECTED',
      premiumPaidTo: data.premiumCollectionMode === 'MIXED' ? 'BOTH' : 'BROKER',
      method: data.method,
      reference: data.reference ?? null,
      transactionCode: data.transactionCode ?? null,
      paymentDate: new Date(data.paymentDate),
      receivedDate: data.receivedDate ? new Date(data.receivedDate) : new Date(),
      bankAccountId: data.bankAccountId ?? null,
      mpesaAccountId: data.mpesaAccountId ?? null,
      status: data.autoVerify ? 'VERIFIED' : 'PENDING',
      verifiedById: data.autoVerify ? userId : null,
      verifiedAt: data.autoVerify ? new Date() : null,
      notes: data.notes ?? null,
      createdById: userId,
    },
  });

  if (data.method === 'MPESA' && data.transactionCode) {
    await tx.mpesaTransaction.upsert({
      where: { transactionCode: data.transactionCode },
      update: {
        paymentId: payment.id,
        mpesaAccountId: data.mpesaAccountId ?? null,
        matchedAt: new Date(),
        matchedById: userId,
      },
      create: {
        paymentId: payment.id,
        mpesaAccountId: data.mpesaAccountId ?? null,
        merchantRequestId: data.mpesa?.merchantRequestId ?? null,
        checkoutRequestId: data.mpesa?.checkoutRequestId ?? null,
        conversationId: data.mpesa?.conversationId ?? null,
        originatorConversationId: data.mpesa?.originatorConversationId ?? null,
        transactionCode: data.transactionCode,
        phoneNumber: data.mpesa?.phoneNumber ?? null,
        accountReference: data.mpesa?.accountReference ?? data.reference ?? null,
        transactionDate: new Date(data.paymentDate),
        amount: paymentAmount,
        resultCode: data.mpesa?.resultCode ?? null,
        resultDescription: data.mpesa?.resultDescription ?? null,
        rawPayload: data.mpesa?.rawPayload as Prisma.InputJsonValue | undefined,
        matchedAt: new Date(),
        matchedById: userId,
      },
    });
  }

  for (const allocation of allocations) {
    await applyAllocation(tx, payment.id, data.clientId, allocation, userId);
  }

  await updatePaymentStatus(tx, payment.id);
  await createReceiptForPayment(tx, payment.id, userId);
  await createPaymentJournalEntry(tx, payment.id, userId);
  const journal = await tx.journalEntry.findFirst({
    where: { paymentId: payment.id, postingEvent: 'BROKER_PREMIUM_RECEIVED' as any },
    orderBy: { createdAt: 'desc' },
    select: { id: true },
  });
  if (journal) {
    await createFinanceTransactionFromBrokerPayment(tx, payment.id, journal.id, userId);
  }
  for (const allocation of allocations.filter((item) => item.policyId)) {
    await recognizePolicyCommission(tx, allocation.policyId!, 'BROKER_COLLECTED_PREMIUM', userId);
  }

  return payment.id;
}

async function resolveCommissionForPolicy(tx: Tx, policyId: string) {
  const policy = await tx.policy.findUniqueOrThrow({
    where: { id: policyId },
    include: {
      client: { select: { type: true } },
      agent: { select: { id: true, defaultCommissionRate: true, withholdingTaxRate: true } },
    },
  });

  const rule = await tx.commissionRule.findFirst({
    where: {
      isActive: true,
      commissionType: policy.renewedFromId ? 'RENEWAL' : 'FIRST_YEAR',
      effectiveFrom: { lte: policy.startDate },
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: policy.startDate } }],
      AND: [
        { OR: [{ productId: policy.productId }, { productId: null }] },
        { OR: [{ insurerId: policy.insurerId }, { insurerId: null }] },
        { OR: [{ agentId: policy.agentId }, { agentId: null }] },
        { OR: [{ clientType: policy.client.type }, { clientType: null }] },
      ],
    },
    orderBy: [{ agentId: 'desc' }, { productId: 'desc' }, { insurerId: 'desc' }, { effectiveFrom: 'desc' }],
  });

  const rate = rule?.rate ?? policy.agent?.defaultCommissionRate ?? new Decimal(0);
  const grossCommission = decimal(policy.totalPremium).mul(rate).toDecimalPlaces(2);
  return { policy, rate, grossCommission };
}

async function recognizePolicyCommission(
  tx: Tx,
  policyId: string,
  source: 'BROKER_COLLECTED_PREMIUM' | 'DIRECT_TO_INSURER_PREMIUM',
  userId: string,
): Promise<string | null> {
  const existing = await tx.commissionEntry.findFirst({
    where: { policyId, commissionSource: source, status: { notIn: ['CANCELLED', 'CLAWED_BACK'] } },
    select: { id: true },
  });
  if (existing) return existing.id;

  const { policy, rate, grossCommission } = await resolveCommissionForPolicy(tx, policyId);
  if (grossCommission.lte(0)) {
    await tx.policy.update({
      where: { id: policyId },
      data: { insurerCommissionStatus: 'NOT_DUE', commissionReceivableAmount: new Decimal(0) },
    });
    return null;
  }

  await tx.policy.update({
    where: { id: policyId },
    data: {
      insurerCommissionStatus: 'RECEIVABLE',
      commissionReceivableAmount: { increment: grossCommission },
    },
  });

  await postJournal(tx, {
    event: source === 'DIRECT_TO_INSURER_PREMIUM' ? 'DIRECT_INSURER_PAYMENT_VERIFIED' : 'COMMISSION_RECOGNIZED',
    entryDate: new Date(),
    description: `Commission receivable recognized for policy ${policy.policyNumber}`,
    reference: policy.policyNumber,
    source: { policyId, insurerId: policy.insurerId, clientId: policy.clientId, agentId: policy.agentId ?? undefined },
    userId,
    lines: [
      {
        accountCode: SYSTEM_ACCOUNTS.COMMISSION_RECEIVABLE_INSURERS,
        debit: grossCommission,
        description: 'Commission receivable from insurer',
      },
      {
        accountCode: SYSTEM_ACCOUNTS.COMMISSION_REVENUE,
        credit: grossCommission,
        description: 'Commission revenue recognized',
      },
    ],
  });

  if (!policy.agentId) return null;

  const withholdingRate = policy.agent?.withholdingTaxRate ?? new Decimal(0);
  const withholdingTax = grossCommission.mul(withholdingRate).toDecimalPlaces(2);
  const netCommission = grossCommission.minus(withholdingTax);
  const entry = await tx.commissionEntry.create({
    data: {
      agentId: policy.agentId,
      policyId: policy.id,
      insurerId: policy.insurerId,
      productId: policy.productId,
      premiumAmount: policy.totalPremium,
      commissionBasis: policy.totalPremium,
      commissionRate: rate,
      grossCommission,
      grossCommissionAmount: grossCommission,
      withholdingTax,
      withholdingTaxAmount: withholdingTax,
      netCommission,
      netCommissionAmount: netCommission,
      commissionType: policy.renewedFromId ? 'RENEWAL' : 'FIRST_YEAR',
      commissionSource: source,
      paymentCollectionMode: source === 'DIRECT_TO_INSURER_PREMIUM' ? 'DIRECT_TO_INSURER' : policy.premiumCollectionMode,
      settlementMode: policy.commissionSettlementMode,
      insurerCommissionStatus: 'RECEIVABLE',
      commissionReceivableAmount: grossCommission,
      status: 'CALCULATED',
      earnedDate: new Date(),
      notes: 'Auto-calculated from policy premium collection event',
    },
  });

  return entry.id;
}

export async function listPayments(req: AuthRequest) {
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(100, parseInt(req.query.limit as string) || 20);
  const skip = (page - 1) * limit;
  const search = (req.query.search as string) || '';
  const status = req.query.status as string | undefined;
  const method = req.query.method as string | undefined;
  const clientId = req.query.clientId as string | undefined;
  const policyId = req.query.policyId as string | undefined;
  const dateFrom = req.query.dateFrom ? new Date(req.query.dateFrom as string) : undefined;
  const dateTo = req.query.dateTo ? new Date(req.query.dateTo as string) : undefined;

  const where: Prisma.PaymentWhereInput = {
    deletedAt: null,
    ...(status && { status: status as any }),
    ...(method && { method: method as any }),
    ...(clientId && { clientId }),
    ...(policyId && { allocations: { some: { policyId, reversedAt: null } } }),
    ...((dateFrom || dateTo) && { paymentDate: { ...(dateFrom && { gte: dateFrom }), ...(dateTo && { lte: dateTo }) } }),
    ...(search && {
      OR: [
        { paymentNumber: { contains: search, mode: 'insensitive' } },
        { reference: { contains: search, mode: 'insensitive' } },
        { transactionCode: { contains: search, mode: 'insensitive' } },
        { client: { is: { OR: [
          { firstName: { contains: search, mode: 'insensitive' } },
          { lastName: { contains: search, mode: 'insensitive' } },
          { companyName: { contains: search, mode: 'insensitive' } },
          { tradingName: { contains: search, mode: 'insensitive' } },
        ] } } },
      ],
    }),
  };

  const [payments, total] = await Promise.all([
    prisma.payment.findMany({
      where,
      skip,
      take: limit,
      orderBy: { paymentDate: 'desc' },
      include: PAYMENT_INCLUDE,
    }),
    prisma.payment.count({ where }),
  ]);

  return { payments, total, page, limit };
}

export async function getPaymentById(id: string) {
  const payment = await prisma.payment.findFirst({
    where: { id, deletedAt: null },
    include: PAYMENT_INCLUDE,
  });
  if (!payment) throw new Error('Payment not found');
  return payment;
}

export async function listDirectInsurerPayments(req: AuthRequest) {
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(100, parseInt(req.query.limit as string) || 20);
  const skip = (page - 1) * limit;
  const policyId = req.query.policyId as string | undefined;
  const insurerId = req.query.insurerId as string | undefined;
  const status = req.query.status as string | undefined;

  const where: Prisma.DirectInsurerPaymentWhereInput = {
    deletedAt: null,
    ...(policyId && { policyId }),
    ...(insurerId && { insurerId }),
    ...(status && { verificationStatus: status as any }),
  };

  const [payments, total] = await Promise.all([
    prisma.directInsurerPayment.findMany({
      where,
      skip,
      take: limit,
      orderBy: { paymentDate: 'desc' },
      include: {
        policy: { select: { id: true, policyNumber: true, totalPremium: true, outstandingAmount: true, status: true } },
        client: { select: { id: true, clientNumber: true, firstName: true, lastName: true, companyName: true, tradingName: true } },
        insurer: { select: { id: true, name: true, shortName: true } },
      },
    }),
    prisma.directInsurerPayment.count({ where }),
  ]);

  return { payments, total, page, limit };
}

export async function getPaymentStats() {
  const [received, completed, pending, reversed, failed, outstanding] = await Promise.all([
    prisma.payment.aggregate({ where: { deletedAt: null, status: { notIn: ['REVERSED', 'FAILED'] } }, _sum: { amount: true }, _count: true }),
    prisma.payment.aggregate({ where: { deletedAt: null, status: 'COMPLETED' }, _sum: { amount: true }, _count: true }),
    prisma.payment.aggregate({ where: { deletedAt: null, status: { in: ['PENDING', 'VERIFIED', 'ALLOCATED'] } }, _sum: { amount: true }, _count: true }),
    prisma.payment.aggregate({ where: { deletedAt: null, status: 'REVERSED' }, _sum: { amount: true }, _count: true }),
    prisma.payment.aggregate({ where: { deletedAt: null, status: 'FAILED' }, _sum: { amount: true }, _count: true }),
    prisma.policy.aggregate({ where: { deletedAt: null, outstandingAmount: { gt: 0 } }, _sum: { outstandingAmount: true }, _count: true }),
  ]);

  return {
    receivedAmount: received._sum.amount ?? 0,
    receivedCount: received._count,
    completedAmount: completed._sum.amount ?? 0,
    completedCount: completed._count,
    pendingAmount: pending._sum.amount ?? 0,
    pendingCount: pending._count,
    reversedAmount: reversed._sum.amount ?? 0,
    reversedCount: reversed._count,
    failedAmount: failed._sum.amount ?? 0,
    failedCount: failed._count,
    outstandingPremium: outstanding._sum.outstandingAmount ?? 0,
    outstandingPolicyCount: outstanding._count,
  };
}

export async function recordPayment(data: RecordPaymentInput, userId: string) {
  if (data.premiumCollectionMode === 'DIRECT_TO_INSURER') {
    throw new Error('Use the direct-to-insurer payment workflow for premiums paid to insurers');
  }

  const paymentId = await prisma.$transaction((tx) => recordBrokerPaymentInTransaction(tx, data, userId), { timeout: 30000 });

  await addJob(QUEUE_NAMES.EMAIL_NOTIFICATIONS, 'payment-receipt-created', { paymentId, userId }).catch(() => false);
  return getPaymentById(paymentId);
}

async function generateAcknowledgementNumber(tx: Tx): Promise<string> {
  const year = new Date().getFullYear();
  const startsWith = `ACK-${year}-`;
  const count = await tx.directInsurerPayment.count({ where: { acknowledgementNumber: { startsWith } } });
  return `${startsWith}${String(count + 1).padStart(6, '0')}`;
}

async function applyVerifiedDirectInsurerPayment(tx: Tx, directPaymentId: string, userId: string): Promise<void> {
  const directPayment = await tx.directInsurerPayment.findUniqueOrThrow({
    where: { id: directPaymentId },
    include: { policy: true },
  });

  const policy = directPayment.policy;
  const amount = decimal(directPayment.amount);
  const nextDirect = decimal(policy.directToInsurerAmount).plus(amount);
  const nextBroker = decimal(policy.brokerCollectedAmount);
  const calculatedOutstanding = decimal(policy.totalPremium).minus(nextBroker).minus(nextDirect);
  const nextOutstanding = calculatedOutstanding.gt(0) ? calculatedOutstanding : new Decimal(0);
  const nextMode = nextBroker.gt(0) ? 'MIXED' : 'DIRECT_TO_INSURER';

  await tx.policy.update({
    where: { id: policy.id },
    data: {
      premiumCollectionMode: nextMode,
      premiumPaidTo: nextMode === 'MIXED' ? 'BOTH' : 'INSURER',
      paidAmount: { increment: amount },
      outstandingAmount: nextOutstanding,
      directToInsurerAmount: nextDirect,
      totalPremiumAmount: policy.totalPremium,
      outstandingPremiumAmount: nextOutstanding,
      paymentVerificationStatus: directPayment.verificationStatus,
    },
  });

  await logPolicyEvent(
    tx,
    policy.id,
    'DIRECT_INSURER_PAYMENT_VERIFIED',
    `Direct insurer payment of ${money(amount)} verified`,
    { directInsurerPaymentId: directPayment.id, insurerReference: directPayment.insurerReference },
    userId,
  );

  const commissionEntryId = await recognizePolicyCommission(tx, policy.id, 'DIRECT_TO_INSURER_PREMIUM', userId);
  if (commissionEntryId) {
    await tx.directInsurerPayment.update({ where: { id: directPayment.id }, data: { commissionEntryId } });
  }
}

export async function recordDirectInsurerPayment(data: RecordDirectInsurerPaymentInput, userId: string) {
  const directPaymentId = await prisma.$transaction(async (tx) => {
    const policy = await tx.policy.findFirst({
      where: { id: data.policyId, deletedAt: null },
      include: {
        client: true,
        insurer: true,
      },
    });
    if (!policy) throw new Error('Policy not found');

    const acknowledgementNumber = data.generateAcknowledgement ? await generateAcknowledgementNumber(tx) : null;
    const directPayment = await tx.directInsurerPayment.create({
      data: {
        acknowledgementNumber,
        policyId: policy.id,
        clientId: policy.clientId,
        insurerId: policy.insurerId,
        amount: decimal(data.amount),
        currency: data.currency,
        paymentDate: new Date(data.paymentDate),
        method: data.method,
        insurerReference: data.insurerReference,
        notes: data.notes ?? null,
        proofOfPaymentDocumentId: data.proofOfPaymentDocumentId ?? null,
        verificationStatus: data.verificationStatus,
        verifiedById: data.verificationStatus === 'VERIFIED' ? userId : null,
        verifiedAt: data.verificationStatus === 'VERIFIED' ? new Date() : null,
        createdById: userId,
      },
    });

    if (acknowledgementNumber) {
      const artifact = await generatePaymentAcknowledgementArtifact({
        acknowledgementNumber,
        policyNumber: policy.policyNumber,
        clientName: clientDisplayName(policy.client),
        insurerName: policy.insurer.name,
        amount: money(decimal(data.amount)),
        paymentMethod: data.method,
        insurerReference: data.insurerReference,
        paymentDate: new Date(data.paymentDate),
        issuedAt: new Date(),
        notes: data.notes,
      });

      const document = await tx.document.create({
        data: {
          entityType: 'DIRECT_INSURER_PAYMENT',
          entityId: directPayment.id,
          clientId: policy.clientId,
          type: 'PAYMENT_ACKNOWLEDGEMENT',
          category: 'PAYMENTS',
          name: `Payment Acknowledgement ${acknowledgementNumber}`,
          description: 'Acknowledgement for premium paid directly to insurer. This is not a Lako cash receipt.',
          fileUrl: artifact.fileUrl,
          fileSize: artifact.fileSize,
          mimeType: artifact.mimeType,
          tags: ['payment-acknowledgement', 'direct-to-insurer', policy.policyNumber],
          createdById: userId,
        },
      });
      await tx.directInsurerPayment.update({
        where: { id: directPayment.id },
        data: { acknowledgementDocumentId: document.id },
      });
    }

    await logPolicyEvent(
      tx,
      policy.id,
      'DIRECT_INSURER_PAYMENT_RECORDED',
      `Direct insurer payment of ${money(decimal(data.amount))} recorded`,
      { directInsurerPaymentId: directPayment.id, insurerReference: data.insurerReference, verificationStatus: data.verificationStatus },
      userId,
    );

    if (data.verificationStatus === 'VERIFIED') {
      await applyVerifiedDirectInsurerPayment(tx, directPayment.id, userId);
    }

    return directPayment.id;
  }, { timeout: 30000 });

  return prisma.directInsurerPayment.findUniqueOrThrow({
    where: { id: directPaymentId },
    include: { policy: true, client: true, insurer: true },
  });
}

export async function verifyDirectInsurerPayment(
  directPaymentId: string,
  data: VerifyDirectInsurerPaymentInput,
  userId: string,
) {
  await prisma.$transaction(async (tx) => {
    const existing = await tx.directInsurerPayment.findFirst({
      where: { id: directPaymentId, deletedAt: null },
      include: { policy: true },
    });
    if (!existing) throw new Error('Direct insurer payment not found');
    if (existing.verificationStatus === 'VERIFIED') throw new Error('Direct insurer payment is already verified');

    await tx.directInsurerPayment.update({
      where: { id: directPaymentId },
      data: {
        verificationStatus: data.verificationStatus,
        verifiedById: userId,
        verifiedAt: new Date(),
        rejectionReason: data.rejectionReason ?? null,
        notes: data.notes ?? existing.notes,
      },
    });

    await tx.policy.update({
      where: { id: existing.policyId },
      data: { paymentVerificationStatus: data.verificationStatus },
    });

    await logPolicyEvent(
      tx,
      existing.policyId,
      data.verificationStatus === 'REJECTED' ? 'DIRECT_INSURER_PAYMENT_REJECTED' : 'DIRECT_INSURER_PAYMENT_VERIFICATION_UPDATED',
      `Direct insurer payment ${data.verificationStatus.toLowerCase().replace(/_/g, ' ')}`,
      { directInsurerPaymentId: directPaymentId, rejectionReason: data.rejectionReason },
      userId,
    );

    if (data.verificationStatus === 'VERIFIED') {
      await applyVerifiedDirectInsurerPayment(tx, directPaymentId, userId);
    }
  }, { timeout: 30000 });

  return prisma.directInsurerPayment.findUniqueOrThrow({
    where: { id: directPaymentId },
    include: { policy: true, client: true, insurer: true },
  });
}

export async function allocatePayment(paymentId: string, data: AllocatePaymentInput, userId: string) {
  const allocationTotal = data.allocations.reduce((sum, allocation) => sum.plus(allocation.amount), new Decimal(0));

  await prisma.$transaction(async (tx) => {
    const payment = await tx.payment.findFirst({ where: { id: paymentId, deletedAt: null } });
    if (!payment) throw new Error('Payment not found');
    if (['REVERSED', 'REFUNDED', 'FAILED'].includes(payment.status)) {
      throw new Error(`Cannot allocate a ${payment.status.toLowerCase()} payment`);
    }

    const alreadyAllocated = await getPaymentAllocatedAmount(tx, paymentId);
    const unallocated = payment.amount.minus(alreadyAllocated);
    if (allocationTotal.gt(unallocated)) {
      throw new Error('Allocation exceeds unallocated payment balance');
    }

    await assertAllocationTargets(tx, payment.clientId, data.allocations);

    for (const allocation of data.allocations) {
      await applyAllocation(tx, paymentId, payment.clientId, allocation, userId);
    }

    await updatePaymentStatus(tx, paymentId);
  }, { timeout: 30000 });

  return getPaymentById(paymentId);
}

export async function verifyPayment(paymentId: string, userId: string) {
  const payment = await prisma.payment.findFirst({ where: { id: paymentId, deletedAt: null } });
  if (!payment) throw new Error('Payment not found');
  if (payment.status !== 'PENDING') throw new Error('Only pending payments can be verified');

  await prisma.payment.update({
    where: { id: paymentId },
    data: { status: 'VERIFIED', verifiedById: userId, verifiedAt: new Date() },
  });
  return getPaymentById(paymentId);
}

export async function failPayment(paymentId: string, reason: string, userId: string) {
  const payment = await prisma.payment.findFirst({ where: { id: paymentId, deletedAt: null } });
  if (!payment) throw new Error('Payment not found');
  if (payment.status !== 'PENDING') throw new Error('Only pending payments can be failed');

  await prisma.payment.update({
    where: { id: paymentId },
    data: { status: 'FAILED', failureReason: reason, verifiedById: userId, verifiedAt: new Date() },
  });
  return getPaymentById(paymentId);
}

export async function reversePayment(paymentId: string, reason: string, userId: string) {
  await prisma.$transaction(async (tx) => {
    const payment = await tx.payment.findFirst({
      where: { id: paymentId, deletedAt: null },
      include: { allocations: true, receipt: true },
    });
    if (!payment) throw new Error('Payment not found');
    if (payment.status === 'REVERSED') throw new Error('Payment is already reversed');

    for (const allocation of payment.allocations.filter((item) => !item.reversedAt)) {
      await tx.paymentAllocation.update({
        where: { id: allocation.id },
        data: { reversedAt: new Date(), reversedById: userId, reversalReason: reason },
      });

      if (allocation.policyId) {
        const policy = await tx.policy.update({
          where: { id: allocation.policyId },
          data: {
            paidAmount: { decrement: allocation.amount },
            outstandingAmount: { increment: allocation.amount },
            brokerCollectedAmount: { decrement: allocation.amount },
            outstandingPremiumAmount: { increment: allocation.amount },
          },
          select: { id: true, policyNumber: true, paidAmount: true, outstandingAmount: true, status: true },
        });

        if (decimal(policy.outstandingAmount).gt(0) && ['ACTIVE', 'PENDING_UNDERWRITING'].includes(policy.status)) {
          await tx.policy.update({ where: { id: policy.id }, data: { status: 'PENDING_PAYMENT' } });
        }

        await logPolicyEvent(
          tx,
          policy.id,
          'PAYMENT_REVERSED',
          `Payment allocation of ${money(allocation.amount)} reversed`,
          { paymentId, allocationId: allocation.id, reason },
          userId,
        );
      }

      if (allocation.invoiceId) {
        const invoice = await tx.invoice.update({
          where: { id: allocation.invoiceId },
          data: {
            paidAmount: { decrement: allocation.amount },
            balanceDue: { increment: allocation.amount },
          },
          select: { id: true, paidAmount: true, balanceDue: true },
        });
        await tx.invoice.update({
          where: { id: invoice.id },
          data: { status: decimal(invoice.paidAmount).lte(0) ? 'ISSUED' : 'PARTIALLY_PAID' },
        });
      }
    }

    await tx.payment.update({
      where: { id: paymentId },
      data: {
        status: 'REVERSED',
        reversalReason: reason,
        reversedById: userId,
        reversedAt: new Date(),
      },
    });

    if (payment.receipt) {
      await tx.receipt.update({
        where: { id: payment.receipt.id },
        data: { voidedAt: new Date(), voidedById: userId, voidReason: reason },
      });
    }
  }, { timeout: 30000 });

  return getPaymentById(paymentId);
}

export async function getPolicyBalance(policyId: string) {
  const policy = await prisma.policy.findFirst({
    where: { id: policyId, deletedAt: null },
    include: {
      client: { select: { id: true, firstName: true, lastName: true, companyName: true, tradingName: true } },
      paymentAllocations: {
        where: { reversedAt: null },
        include: { payment: { select: { id: true, paymentNumber: true, paymentDate: true, method: true, amount: true, status: true } } },
        orderBy: { createdAt: 'desc' },
      },
    },
  });
  if (!policy) throw new Error('Policy not found');
  return policy;
}

export async function createInvoice(data: CreateInvoiceInput, userId: string) {
  const invoice = await prisma.$transaction(async (tx) => {
    const invoiceNumber = await generateSequentialNumber(tx, 'invoice', 'invoiceNumber', 'INV');
    const subtotal = data.lines.reduce((sum, line) => sum.plus(decimal(line.unitPrice).mul(line.quantity)), new Decimal(0));

    return tx.invoice.create({
      data: {
        invoiceNumber,
        clientId: data.clientId,
        insurerId: data.insurerId ?? null,
        invoiceDate: new Date(data.invoiceDate),
        dueDate: new Date(data.dueDate),
        subtotal,
        taxAmount: new Decimal(0),
        totalAmount: subtotal,
        balanceDue: subtotal,
        status: 'ISSUED',
        paymentTerms: data.paymentTerms ?? null,
        notes: data.notes ?? null,
        issuedAt: new Date(),
        createdById: userId,
        lines: {
          create: data.lines.map((line) => {
            const amount = decimal(line.unitPrice).mul(line.quantity);
            return {
              description: line.description,
              quantity: line.quantity,
              unitPrice: decimal(line.unitPrice),
              amount,
              policyId: line.policyId ?? null,
            };
          }),
        },
      },
      include: { lines: true, client: true, insurer: true },
    });
  });

  return invoice;
}

export async function listInvoices(req: AuthRequest) {
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(100, parseInt(req.query.limit as string) || 20);
  const skip = (page - 1) * limit;
  const clientId = req.query.clientId as string | undefined;
  const status = req.query.status as string | undefined;

  const where: Prisma.InvoiceWhereInput = {
    deletedAt: null,
    ...(clientId && { clientId }),
    ...(status && { status: status as any }),
  };

  const [invoices, total] = await Promise.all([
    prisma.invoice.findMany({
      where,
      skip,
      take: limit,
      orderBy: { invoiceDate: 'desc' },
      include: { client: true, insurer: true, lines: true },
    }),
    prisma.invoice.count({ where }),
  ]);

  return { invoices, total, page, limit };
}

export async function listBankAccounts() {
  return prisma.bankAccount.findMany({
    where: { isActive: true, deletedAt: null },
    orderBy: [{ bankName: 'asc' }, { accountName: 'asc' }],
  });
}

export async function listMpesaAccounts() {
  return prisma.mpesaAccount.findMany({
    where: { isActive: true, deletedAt: null },
    orderBy: [{ accountName: 'asc' }],
  });
}
