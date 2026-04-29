-- CreateEnum
CREATE TYPE "FinanceTransactionType" AS ENUM ('BROKER_PREMIUM_PAYMENT', 'DIRECT_INSURER_ACKNOWLEDGEMENT', 'INSURER_COMMISSION_RECEIPT', 'AGENT_COMMISSION_PAYMENT', 'EXPENSE_PAYMENT', 'INSURER_REMITTANCE', 'REFUND', 'JOURNAL_ADJUSTMENT', 'BANK_CHARGE', 'MPESA_CHARGE', 'OPENING_BALANCE', 'OTHER_INFLOW', 'OTHER_OUTFLOW');

-- CreateEnum
CREATE TYPE "FinanceTransactionStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'POSTED', 'REVERSED', 'VOIDED');

-- CreateEnum
CREATE TYPE "VendorStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'SUSPENDED', 'ARCHIVED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "JournalEntryStatus" ADD VALUE 'SUBMITTED';
ALTER TYPE "JournalEntryStatus" ADD VALUE 'VOIDED';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "MatchStatus" ADD VALUE 'UNRECONCILED';
ALTER TYPE "MatchStatus" ADD VALUE 'PARTIALLY_MATCHED';
ALTER TYPE "MatchStatus" ADD VALUE 'RECONCILED';
ALTER TYPE "MatchStatus" ADD VALUE 'DISPUTED';

-- AlterTable
ALTER TABLE "bank_accounts" ADD COLUMN     "isDefault" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "notes" TEXT;

-- AlterTable
ALTER TABLE "expenses" ADD COLUMN     "bankAccountId" TEXT,
ADD COLUMN     "mpesaAccountId" TEXT,
ADD COLUMN     "payImmediately" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "voidReason" TEXT,
ADD COLUMN     "voidedAt" TIMESTAMP(3),
ADD COLUMN     "voidedById" TEXT;

-- AlterTable
ALTER TABLE "journal_entries" ADD COLUMN     "documentId" TEXT,
ADD COLUMN     "sourceKey" TEXT;

-- AlterTable
ALTER TABLE "mpesa_accounts" ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'KES',
ADD COLUMN     "isDefault" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "notes" TEXT;

-- AlterTable
ALTER TABLE "reconciliation_items" ADD COLUMN     "matchedCommissionReceiptId" TEXT,
ADD COLUMN     "matchedExpenseId" TEXT,
ADD COLUMN     "matchedFinanceTransactionId" TEXT,
ADD COLUMN     "matchedJournalEntryId" TEXT,
ADD COLUMN     "matchedRemittanceId" TEXT;

-- AlterTable
ALTER TABLE "statement_uploads" ADD COLUMN     "completedAt" TIMESTAMP(3),
ADD COLUMN     "completedById" TEXT,
ADD COLUMN     "uploadedById" TEXT;

-- AlterTable
ALTER TABLE "vendors" ADD COLUMN     "contactPerson" TEXT,
ADD COLUMN     "paymentTerms" TEXT,
ADD COLUMN     "status" "VendorStatus" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "vendorType" TEXT;

-- CreateTable
CREATE TABLE "finance_transactions" (
    "id" TEXT NOT NULL,
    "transactionNumber" TEXT NOT NULL,
    "type" "FinanceTransactionType" NOT NULL,
    "status" "FinanceTransactionStatus" NOT NULL DEFAULT 'POSTED',
    "transactionDate" TIMESTAMP(3) NOT NULL,
    "description" TEXT NOT NULL,
    "reference" TEXT,
    "amount" DECIMAL(15,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'KES',
    "direction" TEXT NOT NULL,
    "bankAccountId" TEXT,
    "mpesaAccountId" TEXT,
    "journalEntryId" TEXT,
    "paymentId" TEXT,
    "directInsurerPaymentId" TEXT,
    "commissionEntryId" TEXT,
    "insurerCommissionReceiptId" TEXT,
    "remittanceId" TEXT,
    "expenseId" TEXT,
    "agentId" TEXT,
    "insurerId" TEXT,
    "clientId" TEXT,
    "policyId" TEXT,
    "reconciliationStatus" "MatchStatus" NOT NULL DEFAULT 'UNMATCHED',
    "reconciledAt" TIMESTAMP(3),
    "reconciledById" TEXT,
    "documentId" TEXT,
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "finance_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "finance_transactions_transactionNumber_key" ON "finance_transactions"("transactionNumber");

-- CreateIndex
CREATE INDEX "finance_transactions_transactionDate_idx" ON "finance_transactions"("transactionDate");

-- CreateIndex
CREATE INDEX "finance_transactions_type_idx" ON "finance_transactions"("type");

-- CreateIndex
CREATE INDEX "finance_transactions_status_idx" ON "finance_transactions"("status");

-- CreateIndex
CREATE INDEX "finance_transactions_bankAccountId_idx" ON "finance_transactions"("bankAccountId");

-- CreateIndex
CREATE INDEX "finance_transactions_mpesaAccountId_idx" ON "finance_transactions"("mpesaAccountId");

-- CreateIndex
CREATE INDEX "finance_transactions_journalEntryId_idx" ON "finance_transactions"("journalEntryId");

-- CreateIndex
CREATE INDEX "finance_transactions_reconciliationStatus_idx" ON "finance_transactions"("reconciliationStatus");

-- CreateIndex
CREATE INDEX "finance_transactions_reference_idx" ON "finance_transactions"("reference");

-- CreateIndex
CREATE INDEX "bank_accounts_accountType_idx" ON "bank_accounts"("accountType");

-- CreateIndex
CREATE INDEX "bank_accounts_isActive_idx" ON "bank_accounts"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "journal_entries_sourceKey_key" ON "journal_entries"("sourceKey");

-- CreateIndex
CREATE INDEX "mpesa_accounts_accountType_idx" ON "mpesa_accounts"("accountType");

-- CreateIndex
CREATE INDEX "mpesa_accounts_isActive_idx" ON "mpesa_accounts"("isActive");

-- CreateIndex
CREATE INDEX "reconciliation_items_matchedFinanceTransactionId_idx" ON "reconciliation_items"("matchedFinanceTransactionId");

-- CreateIndex
CREATE INDEX "vendors_status_idx" ON "vendors"("status");

-- AddForeignKey
ALTER TABLE "finance_transactions" ADD CONSTRAINT "finance_transactions_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "bank_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_transactions" ADD CONSTRAINT "finance_transactions_mpesaAccountId_fkey" FOREIGN KEY ("mpesaAccountId") REFERENCES "mpesa_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_transactions" ADD CONSTRAINT "finance_transactions_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "journal_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reconciliation_items" ADD CONSTRAINT "reconciliation_items_matchedFinanceTransactionId_fkey" FOREIGN KEY ("matchedFinanceTransactionId") REFERENCES "finance_transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

