import { Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { prisma } from '../../config/database';
import { AuthRequest } from '../../types/express';
import { addJob, QUEUE_NAMES } from '../../config/queues';
import { generateReceiptArtifact } from './receipt.service';
import {
  AllocatePaymentInput,
  CreateInvoiceInput,
  PaymentAllocationInput,
  RecordPaymentInput,
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
  model: 'payment' | 'receipt' | 'invoice' | 'journalEntry',
  field: 'paymentNumber' | 'receiptNumber' | 'invoiceNumber' | 'entryNumber',
  prefix: string,
): Promise<string> {
  const year = new Date().getFullYear();
  const startsWith = `${prefix}-${year}-`;
  const count = await (tx[model] as any).count({ where: { [field]: { startsWith } } });
  return `${startsWith}${String(count + 1).padStart(6, '0')}`;
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
  const entryNumber = await generateSequentialNumber(tx, 'journalEntry', 'entryNumber', 'JE');

  await tx.journalEntry.create({
    data: {
      entryNumber,
      entryDate: payment.paymentDate,
      postingDate: new Date(),
      description: `Premium collection ${payment.paymentNumber}`,
      reference: payment.transactionCode ?? payment.reference ?? payment.paymentNumber,
      entryType: 'PAYMENT_RECEIVED',
      status: 'POSTED',
      totalDebit: payment.amount,
      totalCredit: payment.amount,
      paymentId,
      postedById: userId,
      postedAt: new Date(),
      createdById: userId,
      notes: 'Light journal marker only. Detailed chart-of-account lines will be expanded in Phase 8.',
    },
  });
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
  const allocationTotal = data.allocations.reduce((sum, allocation) => sum.plus(allocation.amount), new Decimal(0));
  const paymentAmount = decimal(data.amount);
  if (allocationTotal.gt(paymentAmount)) {
    throw new Error('Allocated amount cannot exceed payment amount');
  }

  const paymentId = await prisma.$transaction(async (tx) => {
    const client = await tx.client.findFirst({
      where: { id: data.clientId, deletedAt: null },
      select: { id: true },
    });
    if (!client) throw new Error('Client not found');

    await assertAllocationTargets(tx, data.clientId, data.allocations);

    const paymentNumber = await generateSequentialNumber(tx, 'payment', 'paymentNumber', 'PAY');
    const payment = await tx.payment.create({
      data: {
        paymentNumber,
        clientId: data.clientId,
        amount: paymentAmount,
        currency: data.currency,
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

    for (const allocation of data.allocations) {
      await applyAllocation(tx, payment.id, data.clientId, allocation, userId);
    }

    await updatePaymentStatus(tx, payment.id);
    await createReceiptForPayment(tx, payment.id, userId);
    await createPaymentJournalEntry(tx, payment.id, userId);

    return payment.id;
  }, { timeout: 30000 });

  await addJob(QUEUE_NAMES.EMAIL_NOTIFICATIONS, 'payment-receipt-created', { paymentId, userId }).catch(() => false);
  return getPaymentById(paymentId);
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
