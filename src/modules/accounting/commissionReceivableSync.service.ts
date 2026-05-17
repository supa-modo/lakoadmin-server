import { InsurerCommissionStatus, Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/client';

type Tx = Prisma.TransactionClient;

type QuoteLike = {
  id: string;
  policyId: string;
  insurerId: string;
  productId: string | null;
  premiumAmount: Decimal;
  expectedCommissionRate: Decimal;
  expectedGrossCommission: Decimal;
  expectedWhtAmount: Decimal;
  expectedNetCommission: Decimal;
  reconciledGrossCommission: Decimal | null;
  reconciledWhtAmount: Decimal | null;
  reconciledNetCommission: Decimal | null;
  paidAmount: Decimal;
  status: string;
  createdAt: Date;
  policy: {
    renewedFromId: string | null;
    commissionSettlementMode: string;
    premiumCollectionMode: string;
  };
};

export function entryBalanceDue(entry: {
  commissionReceivableAmount: Decimal;
  commissionReceivedAmount: Decimal;
}): Decimal {
  return Decimal.max(
    entry.commissionReceivableAmount.minus(entry.commissionReceivedAmount),
    new Decimal(0),
  );
}

function resolveNetReceivable(quote: QuoteLike): Decimal {
  return quote.reconciledNetCommission ?? quote.expectedNetCommission;
}

function resolveGross(quote: QuoteLike): Decimal {
  return quote.reconciledGrossCommission ?? quote.expectedGrossCommission;
}

function resolveWht(quote: QuoteLike): Decimal {
  return quote.reconciledWhtAmount ?? quote.expectedWhtAmount;
}

function insurerStatusFromAmounts(
  receivable: Decimal,
  received: Decimal,
): InsurerCommissionStatus {
  if (receivable.lte(0)) return 'NOT_DUE';
  if (received.gte(receivable)) return 'RECEIVED';
  if (received.gt(0)) return 'PARTIALLY_RECEIVED';
  return 'RECEIVABLE';
}

export async function ensureAgencyReceivableEntryForQuote(
  tx: Tx,
  quoteId: string,
): Promise<{ id: string }> {
  const quote = await tx.commissionQuote.findUnique({
    where: { id: quoteId },
    include: { policy: true },
  });

  if (!quote?.policy) {
    throw new Error('Commission quote not found');
  }

  const netReceivable = resolveNetReceivable(quote as QuoteLike);
  const gross = resolveGross(quote as QuoteLike);
  const wht = resolveWht(quote as QuoteLike);

  let entry = await tx.commissionEntry.findFirst({
    where: {
      OR: [
        { commissionQuoteId: quote.id },
        { policyId: quote.policyId, agentId: null },
      ],
    },
  });

  const received = entry?.commissionReceivedAmount ?? quote.paidAmount;
  const insurerStatus = insurerStatusFromAmounts(netReceivable, received);

  const shared = {
    commissionQuoteId: quote.id,
    insurerId: quote.insurerId,
    productId: quote.productId,
    premiumAmount: quote.premiumAmount,
    commissionBasis: quote.premiumAmount,
    commissionRate: quote.expectedCommissionRate,
    grossCommission: gross,
    grossCommissionAmount: gross,
    withholdingTax: wht,
    withholdingTaxAmount: wht,
    netCommission: netReceivable,
    netCommissionAmount: netReceivable,
    commissionReceivableAmount: netReceivable,
    commissionReceivedAmount: received,
    insurerCommissionStatus: insurerStatus,
    settlementMode: quote.policy.commissionSettlementMode,
    paymentCollectionMode: quote.policy.premiumCollectionMode,
    commissionSource: 'BROKER_COLLECTED_PREMIUM' as const,
    commissionType: quote.policy.renewedFromId ? ('RENEWAL' as const) : ('FIRST_YEAR' as const),
  };

  if (entry) {
    entry = await tx.commissionEntry.update({
      where: { id: entry.id },
      data: shared,
    });
  } else {
    entry = await tx.commissionEntry.create({
      data: {
        ...shared,
        policyId: quote.policyId,
        agentId: null,
        status: 'RECEIVABLE',
        earnedDate: quote.createdAt,
        notes: 'Agency commission receivable synced from commission quote',
      },
    });
  }

  await tx.policy.update({
    where: { id: quote.policyId },
    data: {
      commissionReceivableAmount: netReceivable,
      commissionReceivedAmount: quote.paidAmount,
      insurerCommissionStatus: insurerStatus,
    },
  });

  return { id: entry.id };
}

const QUOTE_STATUSES_NEEDING_ENTRY = [
  'RECONCILED',
  'INVOICED',
  'PARTIALLY_PAID',
  'STATEMENT_RECEIVED',
] as const;

export async function ensureInsurerReceivableEntries(tx: Tx, insurerId: string): Promise<void> {
  const quotes = await tx.commissionQuote.findMany({
    where: {
      insurerId,
      deletedAt: null,
      status: { in: [...QUOTE_STATUSES_NEEDING_ENTRY] },
    },
    select: { id: true },
  });

  for (const quote of quotes) {
    await ensureAgencyReceivableEntryForQuote(tx, quote.id);
  }
}

export async function syncBalancesAfterInsurerPayment(
  tx: Tx,
  commissionEntryId: string,
  amount: Decimal,
): Promise<void> {
  const entry = await tx.commissionEntry.findUnique({
    where: { id: commissionEntryId },
    include: { commissionQuote: true },
  });

  if (!entry) {
    throw new Error('Commission entry not found');
  }

  const balance = entryBalanceDue(entry);
  if (amount.gt(balance)) {
    throw new Error(
      `Payment amount (${amount.toString()}) exceeds outstanding balance (${balance.toString()})`,
    );
  }

  const received = entry.commissionReceivedAmount.plus(amount);
  const insurerStatus = insurerStatusFromAmounts(entry.commissionReceivableAmount, received);

  await tx.commissionEntry.update({
    where: { id: entry.id },
    data: {
      commissionReceivedAmount: received,
      insurerCommissionStatus: insurerStatus,
    },
  });

  if (entry.commissionQuoteId) {
    const quote =
      entry.commissionQuote ??
      (await tx.commissionQuote.findUnique({ where: { id: entry.commissionQuoteId } }));
    if (quote) {
      const net = quote.reconciledNetCommission ?? quote.expectedNetCommission;
      const newPaid = quote.paidAmount.plus(amount);
      const balanceDue = Decimal.max(net.minus(newPaid), new Decimal(0));
      const quoteStatus = balanceDue.lte(0) ? 'PAID' : 'PARTIALLY_PAID';

      await tx.commissionQuote.update({
        where: { id: quote.id },
        data: {
          paidAmount: newPaid,
          balanceDue,
          status: quoteStatus,
        },
      });

      await tx.policy.update({
        where: { id: entry.policyId },
        data: {
          commissionReceivedAmount: newPaid,
          insurerCommissionStatus: insurerStatus,
        },
      });
      return;
    }
  }

  await tx.policy.update({
    where: { id: entry.policyId },
    data: {
      commissionReceivedAmount: received,
      insurerCommissionStatus: insurerStatus,
    },
  });
}
