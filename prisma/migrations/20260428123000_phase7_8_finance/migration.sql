-- CreateEnum
CREATE TYPE "PremiumCollectionMode" AS ENUM ('BROKER_COLLECTED', 'DIRECT_TO_INSURER', 'MIXED');

-- CreateEnum
CREATE TYPE "PremiumPaidTo" AS ENUM ('BROKER', 'INSURER', 'BOTH');

-- CreateEnum
CREATE TYPE "DirectInsurerPaymentStatus" AS ENUM ('UNVERIFIED', 'VERIFIED', 'REJECTED', 'PARTIALLY_VERIFIED');

-- CreateEnum
CREATE TYPE "CommissionSource" AS ENUM ('BROKER_COLLECTED_PREMIUM', 'DIRECT_TO_INSURER_PREMIUM', 'MANUAL', 'ADJUSTMENT', 'RENEWAL', 'ENDORSEMENT');

-- CreateEnum
CREATE TYPE "CommissionSettlementMode" AS ENUM ('DEDUCTED_AT_SOURCE', 'PAID_BY_INSURER', 'MANUAL');

-- CreateEnum
CREATE TYPE "InsurerCommissionStatus" AS ENUM ('NOT_DUE', 'RECEIVABLE', 'PARTIALLY_RECEIVED', 'RECEIVED', 'OVERDUE', 'WRITTEN_OFF');

-- CreateEnum
CREATE TYPE "PostingEventType" AS ENUM ('BROKER_PREMIUM_RECEIVED', 'DIRECT_INSURER_PAYMENT_VERIFIED', 'COMMISSION_RECOGNIZED', 'INSURER_COMMISSION_RECEIVED', 'INSURER_REMITTANCE_PAID', 'AGENT_COMMISSION_APPROVED', 'AGENT_COMMISSION_PAID', 'PAYMENT_REVERSED', 'RECEIPT_VOIDED', 'REFUND_ISSUED', 'EXPENSE_RECORDED', 'EXPENSE_PAID', 'MANUAL_JOURNAL_POSTED');

-- CreateEnum
CREATE TYPE "FinancialPeriodStatus" AS ENUM ('OPEN', 'LOCKED', 'CLOSED');

-- CreateEnum
CREATE TYPE "ExpenseStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'PAID', 'VOIDED');

-- CreateEnum
CREATE TYPE "RemittanceStatus" AS ENUM ('DRAFT', 'APPROVED', 'PAID', 'PARTIALLY_PAID', 'REVERSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "RemittanceLineStatus" AS ENUM ('PENDING', 'REMITTED', 'PARTIALLY_REMITTED', 'REVERSED');

-- AlterEnum
ALTER TYPE "AgentStatus" ADD VALUE 'INACTIVE';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AgentType" ADD VALUE 'INTERNAL';
ALTER TYPE "AgentType" ADD VALUE 'EXTERNAL';
ALTER TYPE "AgentType" ADD VALUE 'PARTNER';
ALTER TYPE "AgentType" ADD VALUE 'REFERRAL';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "CommissionStatus" ADD VALUE 'DRAFT';
ALTER TYPE "CommissionStatus" ADD VALUE 'PAYABLE';
ALTER TYPE "CommissionStatus" ADD VALUE 'CANCELLED';

-- AlterTable
ALTER TABLE "agents" ADD COLUMN     "agentCode" TEXT,
ADD COLUMN     "kraPin" TEXT,
ADD COLUMN     "mpesaNumber" TEXT,
ADD COLUMN     "withholdingTaxRate" DECIMAL(5,4);

-- AlterTable
ALTER TABLE "commission_entries" ADD COLUMN     "commissionBasis" DECIMAL(15,2),
ADD COLUMN     "commissionReceivableAmount" DECIMAL(15,2) NOT NULL DEFAULT 0,
ADD COLUMN     "commissionReceivedAmount" DECIMAL(15,2) NOT NULL DEFAULT 0,
ADD COLUMN     "commissionSource" "CommissionSource" NOT NULL DEFAULT 'BROKER_COLLECTED_PREMIUM',
ADD COLUMN     "grossCommissionAmount" DECIMAL(15,2),
ADD COLUMN     "insurerCommissionStatus" "InsurerCommissionStatus" NOT NULL DEFAULT 'NOT_DUE',
ADD COLUMN     "insurerId" TEXT,
ADD COLUMN     "manualOverride" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "netCommissionAmount" DECIMAL(15,2),
ADD COLUMN     "overrideReason" TEXT,
ADD COLUMN     "paymentCollectionMode" "PremiumCollectionMode" NOT NULL DEFAULT 'BROKER_COLLECTED',
ADD COLUMN     "paymentMethod" "PaymentMethod",
ADD COLUMN     "productId" TEXT,
ADD COLUMN     "settlementMode" "CommissionSettlementMode" NOT NULL DEFAULT 'PAID_BY_INSURER',
ADD COLUMN     "withholdingTaxAmount" DECIMAL(15,2);

-- AlterTable
ALTER TABLE "journal_entries" ADD COLUMN     "agentId" TEXT,
ADD COLUMN     "clientId" TEXT,
ADD COLUMN     "commissionEntryId" TEXT,
ADD COLUMN     "expenseId" TEXT,
ADD COLUMN     "financialPeriodId" TEXT,
ADD COLUMN     "insurerId" TEXT,
ADD COLUMN     "policyId" TEXT,
ADD COLUMN     "postingEvent" "PostingEventType",
ADD COLUMN     "remittanceId" TEXT;

-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "premiumCollectionMode" "PremiumCollectionMode" NOT NULL DEFAULT 'BROKER_COLLECTED',
ADD COLUMN     "premiumPaidTo" "PremiumPaidTo" NOT NULL DEFAULT 'BROKER';

-- AlterTable
ALTER TABLE "policies" ADD COLUMN     "brokerCollectedAmount" DECIMAL(15,2) NOT NULL DEFAULT 0,
ADD COLUMN     "commissionReceivableAmount" DECIMAL(15,2) NOT NULL DEFAULT 0,
ADD COLUMN     "commissionReceivedAmount" DECIMAL(15,2) NOT NULL DEFAULT 0,
ADD COLUMN     "commissionSettlementMode" "CommissionSettlementMode" NOT NULL DEFAULT 'PAID_BY_INSURER',
ADD COLUMN     "directToInsurerAmount" DECIMAL(15,2) NOT NULL DEFAULT 0,
ADD COLUMN     "insurerCommissionStatus" "InsurerCommissionStatus" NOT NULL DEFAULT 'NOT_DUE',
ADD COLUMN     "outstandingPremiumAmount" DECIMAL(15,2) NOT NULL DEFAULT 0,
ADD COLUMN     "paymentVerificationStatus" "DirectInsurerPaymentStatus" NOT NULL DEFAULT 'UNVERIFIED',
ADD COLUMN     "premiumCollectionMode" "PremiumCollectionMode" NOT NULL DEFAULT 'BROKER_COLLECTED',
ADD COLUMN     "premiumPaidTo" "PremiumPaidTo" NOT NULL DEFAULT 'BROKER',
ADD COLUMN     "totalPremiumAmount" DECIMAL(15,2) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "direct_insurer_payments" (
    "id" TEXT NOT NULL,
    "acknowledgementNumber" TEXT,
    "policyId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "insurerId" TEXT NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'KES',
    "paymentDate" TIMESTAMP(3) NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "insurerReference" TEXT NOT NULL,
    "notes" TEXT,
    "proofOfPaymentDocumentId" TEXT,
    "acknowledgementDocumentId" TEXT,
    "verificationStatus" "DirectInsurerPaymentStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "verifiedById" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "commissionEntryId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "direct_insurer_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "financial_years" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "status" "FinancialPeriodStatus" NOT NULL DEFAULT 'OPEN',
    "lockedById" TEXT,
    "lockedAt" TIMESTAMP(3),
    "closedById" TEXT,
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "financial_years_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "financial_periods" (
    "id" TEXT NOT NULL,
    "financialYearId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "month" INTEGER NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "status" "FinancialPeriodStatus" NOT NULL DEFAULT 'OPEN',
    "lockedById" TEXT,
    "lockedAt" TIMESTAMP(3),
    "closedById" TEXT,
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "financial_periods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendors" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "kraPin" TEXT,
    "address" TEXT,
    "bankName" TEXT,
    "bankBranch" TEXT,
    "bankAccountName" TEXT,
    "bankAccountNumber" TEXT,
    "mpesaNumber" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "vendors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expense_categories" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "ledgerAccountId" TEXT,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "expense_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tax_codes" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "rate" DECIMAL(5,4) NOT NULL,
    "liabilityAccountId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tax_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expenses" (
    "id" TEXT NOT NULL,
    "expenseNumber" TEXT NOT NULL,
    "vendorId" TEXT,
    "categoryId" TEXT NOT NULL,
    "expenseDate" TIMESTAMP(3) NOT NULL,
    "dueDate" TIMESTAMP(3),
    "description" TEXT NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "taxAmount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "totalAmount" DECIMAL(15,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'KES',
    "status" "ExpenseStatus" NOT NULL DEFAULT 'DRAFT',
    "receiptDocumentId" TEXT,
    "paymentMethod" "PaymentMethod",
    "paymentReference" TEXT,
    "paidAt" TIMESTAMP(3),
    "paidById" TEXT,
    "submittedAt" TIMESTAMP(3),
    "submittedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "rejectedAt" TIMESTAMP(3),
    "rejectedById" TEXT,
    "rejectionReason" TEXT,
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "expenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "insurer_remittances" (
    "id" TEXT NOT NULL,
    "remittanceNumber" TEXT NOT NULL,
    "insurerId" TEXT NOT NULL,
    "remittanceDate" TIMESTAMP(3) NOT NULL,
    "dueDate" TIMESTAMP(3),
    "grossPremiumAmount" DECIMAL(15,2) NOT NULL,
    "commissionDeductedAmount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "netRemittanceAmount" DECIMAL(15,2) NOT NULL,
    "paidAmount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "settlementMode" "CommissionSettlementMode" NOT NULL DEFAULT 'DEDUCTED_AT_SOURCE',
    "status" "RemittanceStatus" NOT NULL DEFAULT 'DRAFT',
    "paymentMethod" "PaymentMethod",
    "paymentReference" TEXT,
    "paidAt" TIMESTAMP(3),
    "paidById" TEXT,
    "adviceDocumentId" TEXT,
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "insurer_remittances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "insurer_remittance_lines" (
    "id" TEXT NOT NULL,
    "remittanceId" TEXT NOT NULL,
    "policyId" TEXT NOT NULL,
    "paymentAllocationId" TEXT,
    "grossPremiumAmount" DECIMAL(15,2) NOT NULL,
    "commissionAmount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "netPayableAmount" DECIMAL(15,2) NOT NULL,
    "remittedAmount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "dueDate" TIMESTAMP(3),
    "status" "RemittanceLineStatus" NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "insurer_remittance_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "insurer_commission_receipts" (
    "id" TEXT NOT NULL,
    "receiptNumber" TEXT NOT NULL,
    "insurerId" TEXT NOT NULL,
    "paymentId" TEXT,
    "commissionEntryId" TEXT,
    "amount" DECIMAL(15,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'KES',
    "receivedDate" TIMESTAMP(3) NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "reference" TEXT,
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "insurer_commission_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "direct_insurer_payments_acknowledgementNumber_key" ON "direct_insurer_payments"("acknowledgementNumber");

-- CreateIndex
CREATE INDEX "direct_insurer_payments_policyId_idx" ON "direct_insurer_payments"("policyId");

-- CreateIndex
CREATE INDEX "direct_insurer_payments_clientId_idx" ON "direct_insurer_payments"("clientId");

-- CreateIndex
CREATE INDEX "direct_insurer_payments_insurerId_idx" ON "direct_insurer_payments"("insurerId");

-- CreateIndex
CREATE INDEX "direct_insurer_payments_verificationStatus_idx" ON "direct_insurer_payments"("verificationStatus");

-- CreateIndex
CREATE INDEX "direct_insurer_payments_paymentDate_idx" ON "direct_insurer_payments"("paymentDate");

-- CreateIndex
CREATE UNIQUE INDEX "financial_years_name_key" ON "financial_years"("name");

-- CreateIndex
CREATE UNIQUE INDEX "financial_years_year_key" ON "financial_years"("year");

-- CreateIndex
CREATE INDEX "financial_years_status_idx" ON "financial_years"("status");

-- CreateIndex
CREATE INDEX "financial_periods_status_idx" ON "financial_periods"("status");

-- CreateIndex
CREATE INDEX "financial_periods_startDate_endDate_idx" ON "financial_periods"("startDate", "endDate");

-- CreateIndex
CREATE UNIQUE INDEX "financial_periods_financialYearId_month_key" ON "financial_periods"("financialYearId", "month");

-- CreateIndex
CREATE INDEX "vendors_name_idx" ON "vendors"("name");

-- CreateIndex
CREATE INDEX "vendors_isActive_idx" ON "vendors"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "expense_categories_name_key" ON "expense_categories"("name");

-- CreateIndex
CREATE UNIQUE INDEX "expense_categories_code_key" ON "expense_categories"("code");

-- CreateIndex
CREATE INDEX "expense_categories_isActive_idx" ON "expense_categories"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "tax_codes_code_key" ON "tax_codes"("code");

-- CreateIndex
CREATE INDEX "tax_codes_isActive_idx" ON "tax_codes"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "expenses_expenseNumber_key" ON "expenses"("expenseNumber");

-- CreateIndex
CREATE INDEX "expenses_vendorId_idx" ON "expenses"("vendorId");

-- CreateIndex
CREATE INDEX "expenses_categoryId_idx" ON "expenses"("categoryId");

-- CreateIndex
CREATE INDEX "expenses_status_idx" ON "expenses"("status");

-- CreateIndex
CREATE INDEX "expenses_expenseDate_idx" ON "expenses"("expenseDate");

-- CreateIndex
CREATE UNIQUE INDEX "insurer_remittances_remittanceNumber_key" ON "insurer_remittances"("remittanceNumber");

-- CreateIndex
CREATE INDEX "insurer_remittances_insurerId_idx" ON "insurer_remittances"("insurerId");

-- CreateIndex
CREATE INDEX "insurer_remittances_status_idx" ON "insurer_remittances"("status");

-- CreateIndex
CREATE INDEX "insurer_remittances_remittanceDate_idx" ON "insurer_remittances"("remittanceDate");

-- CreateIndex
CREATE INDEX "insurer_remittance_lines_remittanceId_idx" ON "insurer_remittance_lines"("remittanceId");

-- CreateIndex
CREATE INDEX "insurer_remittance_lines_policyId_idx" ON "insurer_remittance_lines"("policyId");

-- CreateIndex
CREATE INDEX "insurer_remittance_lines_status_idx" ON "insurer_remittance_lines"("status");

-- CreateIndex
CREATE UNIQUE INDEX "insurer_commission_receipts_receiptNumber_key" ON "insurer_commission_receipts"("receiptNumber");

-- CreateIndex
CREATE INDEX "insurer_commission_receipts_insurerId_idx" ON "insurer_commission_receipts"("insurerId");

-- CreateIndex
CREATE INDEX "insurer_commission_receipts_paymentId_idx" ON "insurer_commission_receipts"("paymentId");

-- CreateIndex
CREATE INDEX "insurer_commission_receipts_commissionEntryId_idx" ON "insurer_commission_receipts"("commissionEntryId");

-- CreateIndex
CREATE INDEX "insurer_commission_receipts_receivedDate_idx" ON "insurer_commission_receipts"("receivedDate");

-- CreateIndex
CREATE UNIQUE INDEX "agents_agentCode_key" ON "agents"("agentCode");

-- CreateIndex
CREATE INDEX "agents_agentCode_idx" ON "agents"("agentCode");

-- CreateIndex
CREATE INDEX "commission_entries_insurerId_idx" ON "commission_entries"("insurerId");

-- CreateIndex
CREATE INDEX "commission_entries_productId_idx" ON "commission_entries"("productId");

-- CreateIndex
CREATE INDEX "commission_entries_commissionSource_idx" ON "commission_entries"("commissionSource");

-- CreateIndex
CREATE INDEX "commission_entries_insurerCommissionStatus_idx" ON "commission_entries"("insurerCommissionStatus");

-- CreateIndex
CREATE INDEX "journal_entries_policyId_idx" ON "journal_entries"("policyId");

-- CreateIndex
CREATE INDEX "journal_entries_commissionEntryId_idx" ON "journal_entries"("commissionEntryId");

-- CreateIndex
CREATE INDEX "journal_entries_remittanceId_idx" ON "journal_entries"("remittanceId");

-- CreateIndex
CREATE INDEX "journal_entries_expenseId_idx" ON "journal_entries"("expenseId");

-- CreateIndex
CREATE INDEX "journal_entries_financialPeriodId_idx" ON "journal_entries"("financialPeriodId");

-- CreateIndex
CREATE INDEX "payments_premiumCollectionMode_idx" ON "payments"("premiumCollectionMode");

-- CreateIndex
CREATE INDEX "policies_premiumCollectionMode_idx" ON "policies"("premiumCollectionMode");

-- CreateIndex
CREATE INDEX "policies_insurerCommissionStatus_idx" ON "policies"("insurerCommissionStatus");

-- AddForeignKey
ALTER TABLE "direct_insurer_payments" ADD CONSTRAINT "direct_insurer_payments_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "policies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "direct_insurer_payments" ADD CONSTRAINT "direct_insurer_payments_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "direct_insurer_payments" ADD CONSTRAINT "direct_insurer_payments_insurerId_fkey" FOREIGN KEY ("insurerId") REFERENCES "insurers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commission_entries" ADD CONSTRAINT "commission_entries_insurerId_fkey" FOREIGN KEY ("insurerId") REFERENCES "insurers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commission_entries" ADD CONSTRAINT "commission_entries_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "policies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_commissionEntryId_fkey" FOREIGN KEY ("commissionEntryId") REFERENCES "commission_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_remittanceId_fkey" FOREIGN KEY ("remittanceId") REFERENCES "insurer_remittances"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "expenses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_financialPeriodId_fkey" FOREIGN KEY ("financialPeriodId") REFERENCES "financial_periods"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_periods" ADD CONSTRAINT "financial_periods_financialYearId_fkey" FOREIGN KEY ("financialYearId") REFERENCES "financial_years"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "expense_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "insurer_remittances" ADD CONSTRAINT "insurer_remittances_insurerId_fkey" FOREIGN KEY ("insurerId") REFERENCES "insurers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "insurer_remittance_lines" ADD CONSTRAINT "insurer_remittance_lines_remittanceId_fkey" FOREIGN KEY ("remittanceId") REFERENCES "insurer_remittances"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "insurer_remittance_lines" ADD CONSTRAINT "insurer_remittance_lines_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "policies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "insurer_commission_receipts" ADD CONSTRAINT "insurer_commission_receipts_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "insurer_commission_receipts" ADD CONSTRAINT "insurer_commission_receipts_commissionEntryId_fkey" FOREIGN KEY ("commissionEntryId") REFERENCES "commission_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

