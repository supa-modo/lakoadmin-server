import { Prisma, PrismaClient } from '@prisma/client';
import { AuthRequest } from '../../types/express';
import { prisma } from '../../config/database';
import { createAuditLog } from '../../services/auditService';
import { postJournal } from '../accounting/postingEngine.service';
import { SYSTEM_ACCOUNTS } from '../accounting/postingEngine.service';
import {
  ensureAgencyReceivableEntryForQuote,
  entryBalanceDue,
  syncBalancesAfterInsurerPayment,
} from '../accounting/commissionReceivableSync.service';
import {
  CreateCommissionQuoteInput,
  UpdateCommissionQuoteInput,
  ReconcileCommissionQuoteInput,
  CreateCommissionInvoiceInput,
  RecordCommissionPaymentInput,
  UploadInsurerStatementInput,
  MatchStatementLineInput,
} from './commissionQuotes.validation';

const Decimal = Prisma.Decimal;

// Number generation helpers
async function generateQuoteNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `CQ-${year}-`;
  const count = await prisma.commissionQuote.count({
    where: { quoteNumber: { startsWith: prefix } },
  });
  return `${prefix}${String(count + 1).padStart(6, '0')}`;
}

async function generateInvoiceNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `CI-${year}-`;
  const count = await prisma.commissionInvoice.count({
    where: { invoiceNumber: { startsWith: prefix } },
  });
  return `${prefix}${String(count + 1).padStart(6, '0')}`;
}

async function generatePaymentNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `CP-${year}-`;
  const count = await prisma.commissionPayment.count({
    where: { paymentNumber: { startsWith: prefix } },
  });
  return `${prefix}${String(count + 1).padStart(6, '0')}`;
}

async function generateStatementNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `ICS-${year}-`;
  const count = await prisma.insurerCommissionStatement.count({
    where: { statementNumber: { startsWith: prefix } },
  });
  return `${prefix}${String(count + 1).padStart(6, '0')}`;
}

// Core commission quote operations

export async function createCommissionQuoteFromPolicy(
  policyId: string,
  userId: string,
  providedRate?: number
): Promise<string> {
  return prisma.$transaction(async (tx) => {
    // Get policy with related data
    const policy = await tx.policy.findUnique({
      where: { id: policyId },
      include: { client: true, insurer: true, product: true },
    });

    if (!policy) throw new Error('Policy not found');

    // Check if quote already exists
    const existing = await tx.commissionQuote.findFirst({
      where: { policyId, deletedAt: null },
    });

    if (existing) {
      return existing.id;
    }

    // Get commission rate from rule or setting
    let commissionRate = providedRate ? new Decimal(providedRate) : null;

    if (!commissionRate) {
      const rule = await tx.commissionRule.findFirst({
        where: {
          OR: [
            { insurerId: policy.insurerId, productId: policy.productId },
            { insurerId: policy.insurerId, productId: null },
            { insurerId: null, productId: policy.productId },
            { insurerId: null, productId: null },
          ],
          isActive: true,
        },
        orderBy: [
          { insurerId: 'desc' },
          { productId: 'desc' },
        ],
      });

      if (rule) {
        commissionRate = rule.rate;
      } else {
        // Get default rate from settings
        const setting = await tx.setting.findUnique({
          where: { key: 'commission.defaultAgencyCommissionRate' },
        });
        commissionRate = setting?.value ? new Decimal(setting.value) : new Decimal(0.10);
      }
    }

    // Calculate commission amounts
    const premiumAmount = policy.totalPremium;
    const expectedGrossCommission = premiumAmount.mul(commissionRate).toDecimalPlaces(2);
    const expectedWhtRate = new Decimal(0.10);
    const expectedWhtAmount = expectedGrossCommission.mul(expectedWhtRate).toDecimalPlaces(2);
    const expectedNetCommission = expectedGrossCommission.minus(expectedWhtAmount);
    const balanceDue = expectedNetCommission;

    // Create commission quote
    const quote = await tx.commissionQuote.create({
      data: {
        quoteNumber: await generateQuoteNumber(),
        policyId: policy.id,
        clientId: policy.clientId,
        insurerId: policy.insurerId,
        productId: policy.productId,
        premiumAmount,
        expectedCommissionRate: commissionRate,
        expectedGrossCommission,
        expectedWhtRate,
        expectedWhtAmount,
        expectedNetCommission,
        balanceDue,
        status: 'PENDING_STATEMENT',
        notes: 'Auto-generated commission quote from policy',
        createdById: userId,
      },
    });

    // Create audit log
    await createAuditLog({
      userId,
      action: 'CREATE',
      entity: 'CommissionQuote',
      entityId: quote.id,
      after: quote,
    });

    return quote.id;
  });
}

export async function updateCommissionQuote(
  id: string,
  data: UpdateCommissionQuoteInput,
  userId: string
) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.commissionQuote.findUnique({
      where: { id },
      include: { policy: true },
    });

    if (!existing) throw new Error('Commission quote not found');

    // Only allow edits before reconciliation
    if (existing.status !== 'DRAFT' && existing.status !== 'PENDING_STATEMENT') {
      throw new Error('Cannot edit quote after reconciliation');
    }

    // Recalculate if rate changed
    let updates: any = {
      notes: data.notes,
      updatedAt: new Date(),
    };

    if (data.expectedCommissionRate) {
      const rate = new Decimal(data.expectedCommissionRate);
      const grossCommission = existing.premiumAmount.mul(rate).toDecimalPlaces(2);
      const whtRate = data.expectedWhtRate ? new Decimal(data.expectedWhtRate) : existing.expectedWhtRate;
      const whtAmount = grossCommission.mul(whtRate).toDecimalPlaces(2);
      const netCommission = grossCommission.minus(whtAmount);

      updates = {
        ...updates,
        expectedCommissionRate: rate,
        expectedGrossCommission: grossCommission,
        expectedWhtRate: whtRate,
        expectedWhtAmount: whtAmount,
        expectedNetCommission: netCommission,
        balanceDue: netCommission.minus(existing.paidAmount),
      };
    }

    const updated = await tx.commissionQuote.update({
      where: { id },
      data: updates,
    });

    // Create audit log
    await createAuditLog({
      userId,
      action: 'UPDATE',
      entity: 'CommissionQuote',
      entityId: id,
      before: existing,
      after: updated,
      metadata: { reason: data.reason },
    });

    return updated;
  });
}

export async function reconcileCommissionQuote(
  quoteId: string,
  data: ReconcileCommissionQuoteInput,
  userId: string
) {
  return prisma.$transaction(async (tx) => {
    const quote = await tx.commissionQuote.findUnique({
      where: { id: quoteId },
      include: { policy: true },
    });

    if (!quote) throw new Error('Commission quote not found');

    // Get statement line
    const statementLine = await tx.insurerCommissionStatementLine.findUnique({
      where: { id: data.statementLineId },
    });

    if (!statementLine) throw new Error('Statement line not found');

    // Update quote with reconciled amounts
    const reconciledGross = new Decimal(data.reconciledGrossCommission);
    const reconciledWht = new Decimal(data.reconciledWhtAmount);
    const reconciledNet = new Decimal(data.reconciledNetCommission);

    const updated = await tx.commissionQuote.update({
      where: { id: quoteId },
      data: {
        reconciledGrossCommission: reconciledGross,
        reconciledWhtAmount: reconciledWht,
        reconciledNetCommission: reconciledNet,
        balanceDue: reconciledNet.minus(quote.paidAmount),
        status: 'RECONCILED',
        reconciliationReason: data.reason,
        reconciliationNotes: data.notes,
        reconciledAt: new Date(),
        reconciledById: userId,
      },
    });

    // Update statement line as matched
    await tx.insurerCommissionStatementLine.update({
      where: { id: data.statementLineId },
      data: {
        commissionQuoteId: quoteId,
        matched: true,
        matchedAt: new Date(),
        matchedById: userId,
      },
    });

    // Create or update withholding tax record
    const whtRate = reconciledGross.gt(0) ? reconciledWht.div(reconciledGross) : new Decimal(0.10);
    await tx.withholdingTaxRecord.upsert({
      where: { commissionQuoteId: quoteId },
      create: {
        commissionQuoteId: quoteId,
        insurerId: quote.insurerId,
        grossCommissionAmount: reconciledGross,
        whtRate,
        whtAmount: reconciledWht,
        netCommissionAmount: reconciledNet,
        status: 'ACCRUED',
        createdById: userId,
      },
      update: {
        grossCommissionAmount: reconciledGross,
        whtRate,
        whtAmount: reconciledWht,
        netCommissionAmount: reconciledNet,
        updatedAt: new Date(),
      },
    });

    // Check if feature flag allows immediate revenue recognition
    const setting = await tx.setting.findUnique({
      where: { key: 'finance.recognizeRevenueAtReconciliation' },
    });
    const recognizeNow = setting?.value === 'true';

    if (recognizeNow) {
      // Post revenue recognition journal
      await postJournal(tx, {
        event: 'COMMISSION_RECONCILED',
        entryDate: new Date(),
        description: `Commission reconciled for policy ${quote.policy.policyNumber}`,
        reference: quote.quoteNumber,
        sourceKey: `commission-reconciled:${quoteId}`,
        source: { policyId: quote.policyId },
        userId,
        lines: [
          {
            accountCode: SYSTEM_ACCOUNTS.COMMISSION_RECEIVABLE_INSURERS,
            debit: reconciledNet,
            description: 'Commission receivable from insurer',
          },
          {
            accountCode: SYSTEM_ACCOUNTS.COMMISSION_REVENUE,
            credit: reconciledNet,
            description: 'Commission revenue recognized',
          },
        ],
      });
    }

    // Create audit log
    await createAuditLog({
      userId,
      action: 'RECONCILE',
      entity: 'CommissionQuote',
      entityId: quoteId,
      before: quote,
      after: updated,
      metadata: { statementLineId: data.statementLineId, reason: data.reason },
    });

    await ensureAgencyReceivableEntryForQuote(tx, quoteId);

    return updated;
  });
}

export async function createCommissionInvoice(
  data: CreateCommissionInvoiceInput,
  userId: string
) {
  return prisma.$transaction(async (tx) => {
    const quote = await tx.commissionQuote.findUnique({
      where: { id: data.quoteId },
    });

    if (!quote) throw new Error('Commission quote not found');

    if (quote.status !== 'RECONCILED') {
      throw new Error('Quote must be reconciled before invoicing');
    }

    // Use reconciled amounts if available, otherwise expected amounts
    const grossAmount = quote.reconciledGrossCommission || quote.expectedGrossCommission;
    const whtAmount = quote.reconciledWhtAmount || quote.expectedWhtAmount;
    const netAmount = quote.reconciledNetCommission || quote.expectedNetCommission;

    const invoice = await tx.commissionInvoice.create({
      data: {
        invoiceNumber: await generateInvoiceNumber(),
        etimsInvoiceNumber: data.etimsInvoiceNumber,
        commissionQuoteId: data.quoteId,
        insurerId: quote.insurerId,
        invoiceDate: new Date(data.invoiceDate),
        grossCommissionAmount: grossAmount,
        whtAmount,
        netExpectedPayment: netAmount,
        invoiceDocumentId: data.invoiceDocumentId,
        status: 'ISSUED',
        issuedAt: new Date(),
        issuedById: userId,
        notes: data.notes,
        createdById: userId,
      },
    });

    // Update quote status
    await tx.commissionQuote.update({
      where: { id: data.quoteId },
      data: { status: 'INVOICED' },
    });

    await ensureAgencyReceivableEntryForQuote(tx, data.quoteId);

    // Create audit log
    await createAuditLog({
      userId,
      action: 'CREATE',
      entity: 'CommissionInvoice',
      entityId: invoice.id,
      after: invoice,
      metadata: { commissionQuoteId: data.quoteId },
    });

    return invoice;
  });
}

export async function recordCommissionPayment(
  data: RecordCommissionPaymentInput,
  userId: string
) {
  return prisma.$transaction(async (tx) => {
    const quote = await tx.commissionQuote.findUnique({
      where: { id: data.quoteId },
      include: { policy: true },
    });

    if (!quote) throw new Error('Commission quote not found');

    const amount = new Decimal(data.amount);
    const { id: commissionEntryId } = await ensureAgencyReceivableEntryForQuote(tx, data.quoteId);
    const entry = await tx.commissionEntry.findUnique({ where: { id: commissionEntryId } });
    if (!entry) throw new Error('Commission receivable entry could not be resolved');

    const balance = entryBalanceDue(entry);
    if (amount.gt(balance)) {
      throw new Error(
        `Payment amount (${amount.toString()}) exceeds outstanding balance (${balance.toString()})`,
      );
    }

    // Create payment record
    const payment = await tx.commissionPayment.create({
      data: {
        paymentNumber: await generatePaymentNumber(),
        commissionQuoteId: data.quoteId,
        insurerId: quote.insurerId,
        amount,
        paymentDate: new Date(data.paymentDate),
        paymentMethod: data.paymentMethod as any,
        transactionReference: data.transactionReference,
        bankAccountId: data.bankAccountId,
        mpesaAccountId: data.mpesaAccountId,
        proofDocumentId: data.proofDocumentId,
        notes: data.notes,
        createdById: userId,
      },
    });

    // Generate finance transaction number
    const ftxCount = await tx.financeTransaction.count();
    const ftxNumber = `FTX-${new Date().getFullYear()}-${String(ftxCount + 1).padStart(6, '0')}`;

    // Create finance transaction to update bank/mpesa balance
    const financeTransaction = await tx.financeTransaction.create({
      data: {
        transactionNumber: ftxNumber,
        type: 'INSURER_COMMISSION_RECEIPT',
        status: 'POSTED',
        transactionDate: new Date(data.paymentDate),
        description: `Commission payment for quote ${quote.quoteNumber}`,
        reference: data.transactionReference || payment.paymentNumber,
        amount,
        currency: 'KES',
        direction: 'INFLOW',
        bankAccountId: data.bankAccountId,
        mpesaAccountId: data.mpesaAccountId,
        commissionEntryId,
        insurerId: quote.insurerId,
      },
    });

    // Update payment with finance transaction ID
    await tx.commissionPayment.update({
      where: { id: payment.id },
      data: { financeTransactionId: financeTransaction.id },
    });

    // Post journal entry
    const journal = await postJournal(tx, {
      event: 'COMMISSION_PAYMENT_RECEIVED',
      entryDate: new Date(data.paymentDate),
      description: `Commission payment received for quote ${quote.quoteNumber}`,
      reference: data.transactionReference || payment.paymentNumber,
        sourceKey: `commission-payment:${payment.id}`,
        source: { policyId: quote.policy.id },
      userId,
      lines: [
        {
          accountCode: data.bankAccountId ? SYSTEM_ACCOUNTS.BANK_OPERATING : SYSTEM_ACCOUNTS.MPESA_OPERATING,
          debit: amount,
          description: 'Commission cash received',
        },
        {
          accountCode: SYSTEM_ACCOUNTS.COMMISSION_RECEIVABLE_INSURERS,
          credit: amount,
          description: 'Clear commission receivable',
        },
      ],
    });

    // Link journal to payment
    await tx.commissionPayment.update({
      where: { id: payment.id },
      data: { journalEntryId: journal.id },
    });

    await syncBalancesAfterInsurerPayment(tx, commissionEntryId, amount);

    await tx.insurerCommissionReceipt.create({
      data: {
        receiptNumber: `ICR-${payment.id}`,
        insurerId: quote.insurerId,
        commissionEntryId,
        amount,
        currency: 'KES',
        receivedDate: new Date(data.paymentDate),
        method: data.paymentMethod as any,
        reference: data.transactionReference ?? payment.paymentNumber,
        notes: data.notes ? `Via commission quote payment. ${data.notes}` : 'Via commission quote payment',
        createdById: userId,
      },
    });

    // Create audit log
    await createAuditLog({
      userId,
      action: 'CREATE',
      entity: 'CommissionPayment',
      entityId: payment.id,
      after: payment,
      metadata: { commissionQuoteId: data.quoteId },
    });

    return payment;
  });
}

// Insurer statement operations

export async function uploadInsurerStatement(
  data: UploadInsurerStatementInput,
  userId: string
) {
  return prisma.$transaction(async (tx) => {
    // Create statement header
    const statement = await tx.insurerCommissionStatement.create({
      data: {
        statementNumber: await generateStatementNumber(),
        insurerId: data.insurerId,
        statementDate: new Date(data.statementDate),
        periodStart: new Date(data.periodStart),
        periodEnd: new Date(data.periodEnd),
        statementDocumentId: data.statementDocumentId,
        totalGrossCommission: data.lines.reduce((sum, l) => sum + l.grossCommission, 0),
        totalWhtAmount: data.lines.reduce((sum, l) => sum + l.whtAmount, 0),
        totalNetCommission: data.lines.reduce((sum, l) => sum + l.netCommission, 0),
        uploadedById: userId,
        notes: data.notes,
      },
    });

    // Create statement lines
    for (const line of data.lines) {
      await tx.insurerCommissionStatementLine.create({
        data: {
          statementId: statement.id,
          policyNumber: line.policyNumber,
          clientName: line.clientName,
          productName: line.productName,
          premiumAmount: line.premiumAmount ? new Decimal(line.premiumAmount) : null,
          statementGrossCommission: new Decimal(line.grossCommission),
          statementWhtAmount: new Decimal(line.whtAmount),
          statementNetCommission: new Decimal(line.netCommission),
          notes: line.notes,
        },
      });
    }

    // Create audit log
    await createAuditLog({
      userId,
      action: 'CREATE',
      entity: 'InsurerCommissionStatement',
      entityId: statement.id,
      after: statement,
    });

    return statement;
  });
}

export async function matchStatementLine(
  data: MatchStatementLineInput,
  userId: string
) {
  return prisma.$transaction(async (tx) => {
    const line = await tx.insurerCommissionStatementLine.findUnique({
      where: { id: data.statementLineId },
    });

    if (!line) throw new Error('Statement line not found');
    if (line.matched) throw new Error('Statement line already matched');

    const quote = await tx.commissionQuote.findUnique({
      where: { id: data.commissionQuoteId },
    });

    if (!quote) throw new Error('Commission quote not found');

    // Update line as matched
    const updated = await tx.insurerCommissionStatementLine.update({
      where: { id: data.statementLineId },
      data: {
        commissionQuoteId: data.commissionQuoteId,
        matched: true,
        matchedAt: new Date(),
        matchedById: userId,
      },
    });

    // Update quote status
    await tx.commissionQuote.update({
      where: { id: data.commissionQuoteId },
      data: { status: 'STATEMENT_RECEIVED' },
    });

    // Create audit log
    await createAuditLog({
      userId,
      action: 'MATCH',
      entity: 'InsurerCommissionStatementLine',
      entityId: data.statementLineId,
      after: updated,
      metadata: { commissionQuoteId: data.commissionQuoteId },
    });

    return updated;
  });
}

// List and query operations

export async function listCommissionQuotes(req: AuthRequest) {
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(100, parseInt(req.query.limit as string) || 20);
  const skip = (page - 1) * limit;

  const status = req.query.status as string | undefined;
  const insurerId = req.query.insurerId as string | undefined;
  const policyId = req.query.policyId as string | undefined;
  const clientId = req.query.clientId as string | undefined;

  const where: Prisma.CommissionQuoteWhereInput = {
    deletedAt: null,
    ...(status && { status: status as any }),
    ...(insurerId && { insurerId }),
    ...(policyId && { policyId }),
    ...(clientId && { clientId }),
  };

  const [quotes, total] = await Promise.all([
    prisma.commissionQuote.findMany({
      where,
      include: {
        policy: { select: { policyNumber: true } },
        client: { select: { firstName: true, lastName: true, companyName: true } },
        insurer: { select: { name: true } },
        product: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.commissionQuote.count({ where }),
  ]);

  return { quotes, total, page, limit };
}

export async function getCommissionQuoteById(id: string) {
  const quote = await prisma.commissionQuote.findUnique({
    where: { id },
    include: {
      policy: true,
      client: true,
      insurer: true,
      product: true,
      statementLines: { include: { statement: true } },
      invoices: true,
      payments: { orderBy: { paymentDate: 'desc' } },
      withholdingTax: true,
      commissionEntries: true,
    },
  });

  if (!quote) throw new Error('Commission quote not found');
  return quote;
}

export async function listInsurerStatements(req: AuthRequest) {
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(100, parseInt(req.query.limit as string) || 20);
  const skip = (page - 1) * limit;

  const insurerId = req.query.insurerId as string | undefined;

  const where: Prisma.InsurerCommissionStatementWhereInput = {
    deletedAt: null,
    ...(insurerId && { insurerId }),
  };

  const [statements, total] = await Promise.all([
    prisma.insurerCommissionStatement.findMany({
      where,
      include: {
        insurer: { select: { name: true } },
        lines: { include: { commissionQuote: { select: { quoteNumber: true } } } },
      },
      orderBy: { statementDate: 'desc' },
      skip,
      take: limit,
    }),
    prisma.insurerCommissionStatement.count({ where }),
  ]);

  return { statements, total, page, limit };
}
