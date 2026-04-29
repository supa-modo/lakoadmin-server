-- Split matching support for reconciliation
CREATE TABLE "reconciliation_matches" (
  "id" TEXT NOT NULL,
  "statementUploadId" TEXT NOT NULL,
  "reconciliationItemId" TEXT NOT NULL,
  "financeTransactionId" TEXT NOT NULL,
  "matchedAmount" DECIMAL(15,2) NOT NULL,
  "matchConfidence" DECIMAL(3,2),
  "matchLevel" TEXT,
  "isAuto" BOOLEAN NOT NULL DEFAULT false,
  "notes" TEXT,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "reconciliation_matches_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "reconciliation_matches_reconciliationItemId_financeTransactionId_key"
  ON "reconciliation_matches"("reconciliationItemId", "financeTransactionId");
CREATE INDEX "reconciliation_matches_statementUploadId_idx"
  ON "reconciliation_matches"("statementUploadId");
CREATE INDEX "reconciliation_matches_reconciliationItemId_idx"
  ON "reconciliation_matches"("reconciliationItemId");
CREATE INDEX "reconciliation_matches_financeTransactionId_idx"
  ON "reconciliation_matches"("financeTransactionId");

ALTER TABLE "reconciliation_matches"
  ADD CONSTRAINT "reconciliation_matches_statementUploadId_fkey"
  FOREIGN KEY ("statementUploadId") REFERENCES "statement_uploads"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "reconciliation_matches"
  ADD CONSTRAINT "reconciliation_matches_reconciliationItemId_fkey"
  FOREIGN KEY ("reconciliationItemId") REFERENCES "reconciliation_items"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "reconciliation_matches"
  ADD CONSTRAINT "reconciliation_matches_financeTransactionId_fkey"
  FOREIGN KEY ("financeTransactionId") REFERENCES "finance_transactions"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
