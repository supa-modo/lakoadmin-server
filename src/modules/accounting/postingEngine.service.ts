import { Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/client';

type Tx = Prisma.TransactionClient;

export const SYSTEM_ACCOUNTS = {
  BANK_OPERATING: '1000',
  BANK_TRUST: '1010',
  MPESA_OPERATING: '1020',
  MPESA_TRUST: '1030',
  ACCOUNTS_RECEIVABLE: '1100',
  COMMISSION_RECEIVABLE_INSURERS: '1110',
  UNALLOCATED_PAYMENTS: '1120',
  INSURER_PAYABLE: '2000',
  PREMIUM_TRUST_LIABILITY: '2010',
  AGENT_COMMISSION_PAYABLE: '2020',
  WITHHOLDING_TAX_PAYABLE: '2030',
  VAT_PAYABLE: '2040',
  REFUND_PAYABLE: '2050',
  ACCOUNTS_PAYABLE: '2060',
  COMMISSION_REVENUE: '4000',
  ADMIN_FEE_REVENUE: '4010',
  OTHER_INCOME: '4020',
  AGENT_COMMISSION_EXPENSE: '5000',
  BANK_CHARGES: '5010',
  MPESA_CHARGES: '5020',
  OPERATING_EXPENSES: '5030',
  MARKETING_EXPENSES: '5040',
  SALARIES: '5050',
  RENT: '5060',
  SOFTWARE_HOSTING: '5070',
  UTILITIES: '5080',
  TRANSPORT: '5090',
  OFFICE_SUPPLIES: '5100',
  PROFESSIONAL_FEES: '5110',
  OWNER_EQUITY: '3000',
  RETAINED_EARNINGS: '3100',
} as const;

const CHART_OF_ACCOUNTS = [
  ['1000', 'Bank - Operating', 'ASSET', 'CURRENT_ASSET'],
  ['1010', 'Bank - Trust', 'ASSET', 'CURRENT_ASSET'],
  ['1020', 'M-Pesa - Operating', 'ASSET', 'CURRENT_ASSET'],
  ['1030', 'M-Pesa - Trust', 'ASSET', 'CURRENT_ASSET'],
  ['1100', 'Accounts Receivable', 'ASSET', 'CURRENT_ASSET'],
  ['1110', 'Commission Receivable - Insurers', 'ASSET', 'CURRENT_ASSET'],
  ['1120', 'Unallocated Payments', 'ASSET', 'CURRENT_ASSET'],
  ['2000', 'Insurer Payable', 'LIABILITY', 'CURRENT_LIABILITY'],
  ['2010', 'Premium Trust Liability', 'LIABILITY', 'CURRENT_LIABILITY'],
  ['2020', 'Agent Commission Payable', 'LIABILITY', 'CURRENT_LIABILITY'],
  ['2030', 'Withholding Tax Payable', 'LIABILITY', 'CURRENT_LIABILITY'],
  ['2040', 'VAT Payable', 'LIABILITY', 'CURRENT_LIABILITY'],
  ['2050', 'Refund Payable', 'LIABILITY', 'CURRENT_LIABILITY'],
  ['2060', 'Accounts Payable', 'LIABILITY', 'CURRENT_LIABILITY'],
  ['3000', 'Owner Equity', 'EQUITY', 'SHARE_CAPITAL'],
  ['3100', 'Retained Earnings', 'EQUITY', 'RETAINED_EARNINGS'],
  ['4000', 'Commission Revenue', 'REVENUE', 'OPERATING_REVENUE'],
  ['4010', 'Admin Fee Revenue', 'REVENUE', 'OPERATING_REVENUE'],
  ['4020', 'Other Income', 'REVENUE', 'OTHER_REVENUE'],
  ['5000', 'Agent Commission Expense', 'EXPENSE', 'OPERATING_EXPENSE'],
  ['5010', 'Bank Charges', 'EXPENSE', 'OPERATING_EXPENSE'],
  ['5020', 'M-Pesa Charges', 'EXPENSE', 'OPERATING_EXPENSE'],
  ['5030', 'Operating Expenses', 'EXPENSE', 'OPERATING_EXPENSE'],
  ['5040', 'Marketing Expenses', 'EXPENSE', 'OPERATING_EXPENSE'],
  ['5050', 'Salaries', 'EXPENSE', 'OPERATING_EXPENSE'],
  ['5060', 'Rent', 'EXPENSE', 'OPERATING_EXPENSE'],
  ['5070', 'Software/Hosting', 'EXPENSE', 'OPERATING_EXPENSE'],
  ['5080', 'Utilities Expense', 'EXPENSE', 'OPERATING_EXPENSE'],
  ['5090', 'Transport Expense', 'EXPENSE', 'OPERATING_EXPENSE'],
  ['5100', 'Office Supplies', 'EXPENSE', 'OPERATING_EXPENSE'],
  ['5110', 'Professional Fees', 'EXPENSE', 'OPERATING_EXPENSE'],
] as const;

function decimal(value: number | string | Decimal): Decimal {
  return value instanceof Decimal ? value : new Decimal(value);
}

async function nextEntryNumber(tx: Tx): Promise<string> {
  const year = new Date().getFullYear();
  const startsWith = `JE-${year}-`;
  const count = await tx.journalEntry.count({ where: { entryNumber: { startsWith } } });
  return `${startsWith}${String(count + 1).padStart(6, '0')}`;
}

export async function ensureChartOfAccounts(tx: Tx): Promise<void> {
  for (const [code, name, type, subtype] of CHART_OF_ACCOUNTS) {
    await tx.ledgerAccount.upsert({
      where: { code },
      update: { name, type: type as any, subtype: subtype as any, isSystemAccount: true, isActive: true },
      create: { code, name, type: type as any, subtype: subtype as any, isSystemAccount: true },
    });
  }
}

async function getAccountMap(tx: Tx, codes: string[]) {
  await ensureChartOfAccounts(tx);
  const accounts = await tx.ledgerAccount.findMany({ where: { code: { in: codes }, isActive: true } });
  const map = new Map(accounts.map((account) => [account.code, account]));
  for (const code of codes) {
    if (!map.has(code)) throw new Error(`Ledger account ${code} is not configured`);
  }
  return map;
}

async function getOpenPeriod(tx: Tx, date: Date) {
  const period = await tx.financialPeriod.findFirst({
    where: { startDate: { lte: date }, endDate: { gte: date } },
  });
  if (!period) return null;
  if (period.status !== 'OPEN') {
    throw new Error(`Cannot post into ${period.status.toLowerCase()} financial period ${period.name}`);
  }
  return period;
}

function accountBalanceDelta(type: string, debit: Decimal, credit: Decimal): Decimal {
  if (type === 'ASSET' || type === 'EXPENSE') return debit.minus(credit);
  return credit.minus(debit);
}

export interface PostingLineInput {
  accountCode: string;
  debit?: number | string | Decimal;
  credit?: number | string | Decimal;
  description?: string;
  referenceType?: string;
  referenceId?: string;
}

export interface PostingInput {
  event: string;
  entryDate?: Date;
  description: string;
  reference?: string | null;
  lines: PostingLineInput[];
  source?: {
    paymentId?: string;
    policyId?: string;
    insurerId?: string;
    clientId?: string;
    commissionEntryId?: string;
    remittanceId?: string;
    expenseId?: string;
    agentId?: string;
  };
  sourceKey?: string;
  userId?: string;
  notes?: string;
}

export async function postJournal(tx: Tx, input: PostingInput) {
  const entryDate = input.entryDate ?? new Date();
  if (input.sourceKey) {
    const existing = await tx.journalEntry.findUnique({
      where: { sourceKey: input.sourceKey },
      include: { lines: true },
    });
    if (existing) return existing;
  }
  const accountCodes = input.lines.map((line) => line.accountCode);
  const accounts = await getAccountMap(tx, accountCodes);
  const period = await getOpenPeriod(tx, entryDate);

  let totalDebit = new Decimal(0);
  let totalCredit = new Decimal(0);
  const lines = input.lines.map((line) => {
    const debit = decimal(line.debit ?? 0);
    const credit = decimal(line.credit ?? 0);
    if (debit.gt(0) && credit.gt(0)) throw new Error('A journal line cannot contain both debit and credit');
    if (debit.lte(0) && credit.lte(0)) throw new Error('Every journal line must have a debit or credit amount');
    totalDebit = totalDebit.plus(debit);
    totalCredit = totalCredit.plus(credit);
    return { ...line, debit, credit, account: accounts.get(line.accountCode)! };
  });

  if (!totalDebit.eq(totalCredit)) {
    throw new Error(`Journal is not balanced. Debit ${totalDebit.toFixed(2)} Credit ${totalCredit.toFixed(2)}`);
  }

  const entry = await tx.journalEntry.create({
    data: {
      entryNumber: await nextEntryNumber(tx),
      entryDate,
      postingDate: new Date(),
      description: input.description,
      reference: input.reference ?? null,
      entryType: input.event === 'MANUAL_JOURNAL_POSTED' ? 'STANDARD' : 'ADJUSTMENT',
      status: 'POSTED',
      totalDebit,
      totalCredit,
      paymentId: input.source?.paymentId ?? null,
      policyId: input.source?.policyId ?? null,
      insurerId: input.source?.insurerId ?? null,
      clientId: input.source?.clientId ?? null,
      commissionEntryId: input.source?.commissionEntryId ?? null,
      remittanceId: input.source?.remittanceId ?? null,
      expenseId: input.source?.expenseId ?? null,
      agentId: input.source?.agentId ?? null,
      financialPeriodId: period?.id ?? null,
      fiscalYear: period ? entryDate.getFullYear() : undefined,
      fiscalPeriod: period?.month ?? undefined,
      postingEvent: input.event as any,
      sourceKey: input.sourceKey ?? null,
      postedById: input.userId ?? null,
      postedAt: new Date(),
      createdById: input.userId ?? null,
      notes: input.notes ?? null,
      lines: {
        create: lines.map((line) => ({
          accountId: line.account.id,
          debit: line.debit,
          credit: line.credit,
          description: line.description ?? input.description,
          referenceType: line.referenceType ?? input.event,
          referenceId: line.referenceId ?? input.source?.paymentId ?? input.source?.policyId ?? null,
        })),
      },
    },
    include: { lines: true },
  });

  for (const line of lines) {
    await tx.ledgerAccount.update({
      where: { id: line.account.id },
      data: {
        currentBalance: {
          increment: accountBalanceDelta(line.account.type, line.debit, line.credit),
        },
      },
    });
  }

  return entry;
}
