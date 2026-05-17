/*
  Warnings:

  - Added the required column `balanceDue` to the `expenses` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "CommissionQuoteStatus" AS ENUM ('DRAFT', 'PENDING_STATEMENT', 'STATEMENT_RECEIVED', 'RECONCILED', 'INVOICED', 'PARTIALLY_PAID', 'PAID', 'CANCELLED', 'WRITTEN_OFF');

-- CreateEnum
CREATE TYPE "ExtractionStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'FAILED', 'REVIEWED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ExpenseStatus" ADD VALUE 'PENDING_PAYMENT';
ALTER TYPE "ExpenseStatus" ADD VALUE 'PARTIALLY_PAID';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ReconciliationStatus" ADD VALUE 'EXTRACTED';
ALTER TYPE "ReconciliationStatus" ADD VALUE 'PENDING_REVIEW';
ALTER TYPE "ReconciliationStatus" ADD VALUE 'FAILED_EXTRACTION';

-- DropForeignKey
ALTER TABLE "commission_entries" DROP CONSTRAINT "commission_entries_agentId_fkey";

-- AlterTable
ALTER TABLE "_ClaimQueryResponseDocuments" ADD CONSTRAINT "_ClaimQueryResponseDocuments_AB_pkey" PRIMARY KEY ("A", "B");

-- DropIndex
DROP INDEX "_ClaimQueryResponseDocuments_AB_unique";

-- AlterTable
ALTER TABLE "claim_query_responses" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "commission_entries" ADD COLUMN     "commissionQuoteId" TEXT;

-- AlterTable
ALTER TABLE "document_requirements" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "expenses" ADD COLUMN     "balanceDue" DECIMAL(15,2) NOT NULL,
ADD COLUMN     "paidAmount" DECIMAL(15,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "message_logs" ALTER COLUMN "status" SET DEFAULT 'DRAFT';

-- AlterTable
ALTER TABLE "renewal_reminder_logs" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "statement_uploads" ADD COLUMN     "extractedAt" TIMESTAMP(3),
ADD COLUMN     "extractionStatus" "ExtractionStatus",
ADD COLUMN     "rawExtractedPayload" JSONB,
ADD COLUMN     "reviewedAt" TIMESTAMP(3),
ADD COLUMN     "reviewedById" TEXT;

-- CreateTable
CREATE TABLE "commission_quotes" (
    "id" TEXT NOT NULL,
    "quoteNumber" TEXT NOT NULL,
    "policyId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "insurerId" TEXT NOT NULL,
    "productId" TEXT,
    "premiumAmount" DECIMAL(15,2) NOT NULL,
    "expectedCommissionRate" DECIMAL(5,4) NOT NULL,
    "expectedGrossCommission" DECIMAL(15,2) NOT NULL,
    "expectedWhtRate" DECIMAL(5,4) NOT NULL DEFAULT 0.10,
    "expectedWhtAmount" DECIMAL(15,2) NOT NULL,
    "expectedNetCommission" DECIMAL(15,2) NOT NULL,
    "reconciledGrossCommission" DECIMAL(15,2),
    "reconciledWhtAmount" DECIMAL(15,2),
    "reconciledNetCommission" DECIMAL(15,2),
    "paidAmount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "balanceDue" DECIMAL(15,2) NOT NULL,
    "status" "CommissionQuoteStatus" NOT NULL DEFAULT 'DRAFT',
    "assignedAccountantId" TEXT,
    "reconciliationReason" TEXT,
    "reconciliationNotes" TEXT,
    "reconciledAt" TIMESTAMP(3),
    "reconciledById" TEXT,
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "commission_quotes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "insurer_commission_statements" (
    "id" TEXT NOT NULL,
    "statementNumber" TEXT NOT NULL,
    "insurerId" TEXT NOT NULL,
    "statementDate" TIMESTAMP(3) NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "statementDocumentId" TEXT,
    "totalGrossCommission" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "totalWhtAmount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "totalNetCommission" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "uploadedById" TEXT,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "insurer_commission_statements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "insurer_commission_statement_lines" (
    "id" TEXT NOT NULL,
    "statementId" TEXT NOT NULL,
    "commissionQuoteId" TEXT,
    "policyNumber" TEXT,
    "clientName" TEXT,
    "productName" TEXT,
    "premiumAmount" DECIMAL(15,2),
    "statementGrossCommission" DECIMAL(15,2) NOT NULL,
    "statementWhtAmount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "statementNetCommission" DECIMAL(15,2) NOT NULL,
    "matched" BOOLEAN NOT NULL DEFAULT false,
    "matchedAt" TIMESTAMP(3),
    "matchedById" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "insurer_commission_statement_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commission_invoices" (
    "id" TEXT NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "etimsInvoiceNumber" TEXT,
    "commissionQuoteId" TEXT NOT NULL,
    "insurerId" TEXT NOT NULL,
    "invoiceDate" TIMESTAMP(3) NOT NULL,
    "grossCommissionAmount" DECIMAL(15,2) NOT NULL,
    "whtAmount" DECIMAL(15,2) NOT NULL,
    "netExpectedPayment" DECIMAL(15,2) NOT NULL,
    "invoiceDocumentId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ISSUED',
    "issuedAt" TIMESTAMP(3),
    "issuedById" TEXT,
    "sentAt" TIMESTAMP(3),
    "sentById" TEXT,
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "commission_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commission_payments" (
    "id" TEXT NOT NULL,
    "paymentNumber" TEXT NOT NULL,
    "commissionQuoteId" TEXT NOT NULL,
    "insurerId" TEXT NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "paymentDate" TIMESTAMP(3) NOT NULL,
    "paymentMethod" "PaymentMethod" NOT NULL,
    "transactionReference" TEXT,
    "bankAccountId" TEXT,
    "mpesaAccountId" TEXT,
    "financeTransactionId" TEXT,
    "journalEntryId" TEXT,
    "proofDocumentId" TEXT,
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "commission_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "withholding_tax_records" (
    "id" TEXT NOT NULL,
    "commissionQuoteId" TEXT NOT NULL,
    "insurerId" TEXT NOT NULL,
    "grossCommissionAmount" DECIMAL(15,2) NOT NULL,
    "whtRate" DECIMAL(5,4) NOT NULL,
    "whtAmount" DECIMAL(15,2) NOT NULL,
    "netCommissionAmount" DECIMAL(15,2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACCRUED',
    "certificateDocumentId" TEXT,
    "certificateReceivedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "withholding_tax_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expense_payments" (
    "id" TEXT NOT NULL,
    "paymentNumber" TEXT NOT NULL,
    "expenseId" TEXT NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "paymentDate" TIMESTAMP(3) NOT NULL,
    "paymentMethod" "PaymentMethod" NOT NULL,
    "paymentReference" TEXT,
    "bankAccountId" TEXT,
    "mpesaAccountId" TEXT,
    "financeTransactionId" TEXT,
    "journalEntryId" TEXT,
    "proofDocumentId" TEXT,
    "notes" TEXT,
    "paidById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "expense_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_dependents" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT,
    "dateOfBirth" TIMESTAMP(3),
    "gender" TEXT,
    "relationship" TEXT NOT NULL,
    "nationalId" TEXT,
    "passportNumber" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "client_dependents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "commission_quotes_quoteNumber_key" ON "commission_quotes"("quoteNumber");

-- CreateIndex
CREATE INDEX "commission_quotes_policyId_idx" ON "commission_quotes"("policyId");

-- CreateIndex
CREATE INDEX "commission_quotes_clientId_idx" ON "commission_quotes"("clientId");

-- CreateIndex
CREATE INDEX "commission_quotes_insurerId_idx" ON "commission_quotes"("insurerId");

-- CreateIndex
CREATE INDEX "commission_quotes_productId_idx" ON "commission_quotes"("productId");

-- CreateIndex
CREATE INDEX "commission_quotes_status_idx" ON "commission_quotes"("status");

-- CreateIndex
CREATE INDEX "commission_quotes_assignedAccountantId_idx" ON "commission_quotes"("assignedAccountantId");

-- CreateIndex
CREATE UNIQUE INDEX "insurer_commission_statements_statementNumber_key" ON "insurer_commission_statements"("statementNumber");

-- CreateIndex
CREATE INDEX "insurer_commission_statements_insurerId_idx" ON "insurer_commission_statements"("insurerId");

-- CreateIndex
CREATE INDEX "insurer_commission_statements_statementDate_idx" ON "insurer_commission_statements"("statementDate");

-- CreateIndex
CREATE INDEX "insurer_commission_statement_lines_statementId_idx" ON "insurer_commission_statement_lines"("statementId");

-- CreateIndex
CREATE INDEX "insurer_commission_statement_lines_commissionQuoteId_idx" ON "insurer_commission_statement_lines"("commissionQuoteId");

-- CreateIndex
CREATE INDEX "insurer_commission_statement_lines_policyNumber_idx" ON "insurer_commission_statement_lines"("policyNumber");

-- CreateIndex
CREATE UNIQUE INDEX "commission_invoices_invoiceNumber_key" ON "commission_invoices"("invoiceNumber");

-- CreateIndex
CREATE INDEX "commission_invoices_commissionQuoteId_idx" ON "commission_invoices"("commissionQuoteId");

-- CreateIndex
CREATE INDEX "commission_invoices_insurerId_idx" ON "commission_invoices"("insurerId");

-- CreateIndex
CREATE INDEX "commission_invoices_invoiceDate_idx" ON "commission_invoices"("invoiceDate");

-- CreateIndex
CREATE INDEX "commission_invoices_etimsInvoiceNumber_idx" ON "commission_invoices"("etimsInvoiceNumber");

-- CreateIndex
CREATE UNIQUE INDEX "commission_payments_paymentNumber_key" ON "commission_payments"("paymentNumber");

-- CreateIndex
CREATE INDEX "commission_payments_commissionQuoteId_idx" ON "commission_payments"("commissionQuoteId");

-- CreateIndex
CREATE INDEX "commission_payments_insurerId_idx" ON "commission_payments"("insurerId");

-- CreateIndex
CREATE INDEX "commission_payments_paymentDate_idx" ON "commission_payments"("paymentDate");

-- CreateIndex
CREATE INDEX "commission_payments_bankAccountId_idx" ON "commission_payments"("bankAccountId");

-- CreateIndex
CREATE INDEX "commission_payments_mpesaAccountId_idx" ON "commission_payments"("mpesaAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "withholding_tax_records_commissionQuoteId_key" ON "withholding_tax_records"("commissionQuoteId");

-- CreateIndex
CREATE INDEX "withholding_tax_records_commissionQuoteId_idx" ON "withholding_tax_records"("commissionQuoteId");

-- CreateIndex
CREATE INDEX "withholding_tax_records_insurerId_idx" ON "withholding_tax_records"("insurerId");

-- CreateIndex
CREATE UNIQUE INDEX "expense_payments_paymentNumber_key" ON "expense_payments"("paymentNumber");

-- CreateIndex
CREATE INDEX "expense_payments_expenseId_idx" ON "expense_payments"("expenseId");

-- CreateIndex
CREATE INDEX "expense_payments_paymentDate_idx" ON "expense_payments"("paymentDate");

-- CreateIndex
CREATE INDEX "expense_payments_bankAccountId_idx" ON "expense_payments"("bankAccountId");

-- CreateIndex
CREATE INDEX "expense_payments_mpesaAccountId_idx" ON "expense_payments"("mpesaAccountId");

-- CreateIndex
CREATE INDEX "client_dependents_clientId_idx" ON "client_dependents"("clientId");

-- CreateIndex
CREATE INDEX "client_dependents_relationship_idx" ON "client_dependents"("relationship");

-- CreateIndex
CREATE INDEX "commission_entries_commissionQuoteId_idx" ON "commission_entries"("commissionQuoteId");

-- AddForeignKey
ALTER TABLE "commission_entries" ADD CONSTRAINT "commission_entries_commissionQuoteId_fkey" FOREIGN KEY ("commissionQuoteId") REFERENCES "commission_quotes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commission_entries" ADD CONSTRAINT "commission_entries_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "agents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commission_quotes" ADD CONSTRAINT "commission_quotes_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "policies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commission_quotes" ADD CONSTRAINT "commission_quotes_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commission_quotes" ADD CONSTRAINT "commission_quotes_insurerId_fkey" FOREIGN KEY ("insurerId") REFERENCES "insurers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commission_quotes" ADD CONSTRAINT "commission_quotes_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commission_quotes" ADD CONSTRAINT "commission_quotes_assignedAccountantId_fkey" FOREIGN KEY ("assignedAccountantId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "insurer_commission_statements" ADD CONSTRAINT "insurer_commission_statements_insurerId_fkey" FOREIGN KEY ("insurerId") REFERENCES "insurers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "insurer_commission_statement_lines" ADD CONSTRAINT "insurer_commission_statement_lines_statementId_fkey" FOREIGN KEY ("statementId") REFERENCES "insurer_commission_statements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "insurer_commission_statement_lines" ADD CONSTRAINT "insurer_commission_statement_lines_commissionQuoteId_fkey" FOREIGN KEY ("commissionQuoteId") REFERENCES "commission_quotes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commission_invoices" ADD CONSTRAINT "commission_invoices_commissionQuoteId_fkey" FOREIGN KEY ("commissionQuoteId") REFERENCES "commission_quotes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commission_invoices" ADD CONSTRAINT "commission_invoices_insurerId_fkey" FOREIGN KEY ("insurerId") REFERENCES "insurers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commission_payments" ADD CONSTRAINT "commission_payments_commissionQuoteId_fkey" FOREIGN KEY ("commissionQuoteId") REFERENCES "commission_quotes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commission_payments" ADD CONSTRAINT "commission_payments_insurerId_fkey" FOREIGN KEY ("insurerId") REFERENCES "insurers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commission_payments" ADD CONSTRAINT "commission_payments_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "bank_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commission_payments" ADD CONSTRAINT "commission_payments_mpesaAccountId_fkey" FOREIGN KEY ("mpesaAccountId") REFERENCES "mpesa_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "withholding_tax_records" ADD CONSTRAINT "withholding_tax_records_commissionQuoteId_fkey" FOREIGN KEY ("commissionQuoteId") REFERENCES "commission_quotes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "withholding_tax_records" ADD CONSTRAINT "withholding_tax_records_insurerId_fkey" FOREIGN KEY ("insurerId") REFERENCES "insurers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense_payments" ADD CONSTRAINT "expense_payments_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "expenses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense_payments" ADD CONSTRAINT "expense_payments_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "bank_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense_payments" ADD CONSTRAINT "expense_payments_mpesaAccountId_fkey" FOREIGN KEY ("mpesaAccountId") REFERENCES "mpesa_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_dependents" ADD CONSTRAINT "client_dependents_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "renewal_reminder_logs_policyId_cadenceDays_reminderDate_channel" RENAME TO "renewal_reminder_logs_policyId_cadenceDays_reminderDate_cha_key";
