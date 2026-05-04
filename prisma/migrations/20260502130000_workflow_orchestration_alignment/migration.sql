-- Workflow orchestration alignment:
-- - Adds accounting posting state markers for operational entities.
-- - Allows agency-level commission entries without forcing an agent.
-- - Expands task linkage so automated work can point at the exact source entity.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'AccountingPostedStatus') THEN
    CREATE TYPE "AccountingPostedStatus" AS ENUM ('NOT_POSTED', 'QUEUED', 'POSTED', 'FAILED');
  END IF;
END $$;

ALTER TYPE "CommissionStatus" ADD VALUE IF NOT EXISTS 'RECEIVABLE';
ALTER TYPE "CommissionStatus" ADD VALUE IF NOT EXISTS 'DEDUCTED_AT_SOURCE';
ALTER TYPE "CommissionStatus" ADD VALUE IF NOT EXISTS 'PARTIALLY_RECEIVED';
ALTER TYPE "CommissionStatus" ADD VALUE IF NOT EXISTS 'RECEIVED';
ALTER TYPE "CommissionStatus" ADD VALUE IF NOT EXISTS 'WRITTEN_OFF';

ALTER TABLE "commission_entries"
  ALTER COLUMN "agentId" DROP NOT NULL,
  ADD COLUMN "accountingPostedStatus" "AccountingPostedStatus" NOT NULL DEFAULT 'NOT_POSTED';

ALTER TABLE "policies"
  ADD COLUMN "accountingPostedStatus" "AccountingPostedStatus" NOT NULL DEFAULT 'NOT_POSTED';

ALTER TABLE "payments"
  ADD COLUMN "accountingPostedStatus" "AccountingPostedStatus" NOT NULL DEFAULT 'NOT_POSTED';

ALTER TABLE "direct_insurer_payments"
  ADD COLUMN "accountingPostedStatus" "AccountingPostedStatus" NOT NULL DEFAULT 'NOT_POSTED';

ALTER TABLE "tasks"
  ADD COLUMN "paymentId" TEXT,
  ADD COLUMN "commissionEntryId" TEXT,
  ADD COLUMN "insurerId" TEXT,
  ADD COLUMN "agentId" TEXT;

CREATE INDEX "commission_entries_accountingPostedStatus_idx" ON "commission_entries"("accountingPostedStatus");
CREATE INDEX "policies_accountingPostedStatus_idx" ON "policies"("accountingPostedStatus");
CREATE INDEX "payments_accountingPostedStatus_idx" ON "payments"("accountingPostedStatus");
CREATE INDEX "direct_insurer_payments_accountingPostedStatus_idx" ON "direct_insurer_payments"("accountingPostedStatus");
CREATE INDEX "direct_insurer_payments_commissionEntryId_idx" ON "direct_insurer_payments"("commissionEntryId");
CREATE INDEX "tasks_paymentId_idx" ON "tasks"("paymentId");
CREATE INDEX "tasks_commissionEntryId_idx" ON "tasks"("commissionEntryId");
CREATE INDEX "tasks_insurerId_idx" ON "tasks"("insurerId");
CREATE INDEX "tasks_agentId_idx" ON "tasks"("agentId");

ALTER TABLE "direct_insurer_payments"
  ADD CONSTRAINT "direct_insurer_payments_commissionEntryId_fkey"
  FOREIGN KEY ("commissionEntryId") REFERENCES "commission_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "tasks"
  ADD CONSTRAINT "tasks_paymentId_fkey"
  FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "tasks"
  ADD CONSTRAINT "tasks_commissionEntryId_fkey"
  FOREIGN KEY ("commissionEntryId") REFERENCES "commission_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "tasks"
  ADD CONSTRAINT "tasks_insurerId_fkey"
  FOREIGN KEY ("insurerId") REFERENCES "insurers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "tasks"
  ADD CONSTRAINT "tasks_agentId_fkey"
  FOREIGN KEY ("agentId") REFERENCES "agents"("id") ON DELETE SET NULL ON UPDATE CASCADE;
