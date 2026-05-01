-- Claims management phase

ALTER TYPE "ClaimStatus" ADD VALUE IF NOT EXISTS 'ASSESSED';
ALTER TYPE "ClaimStatus" ADD VALUE IF NOT EXISTS 'APPEAL';
ALTER TYPE "ClaimStatus" ADD VALUE IF NOT EXISTS 'PARTIALLY_SETTLED';
ALTER TYPE "ClaimStatus" ADD VALUE IF NOT EXISTS 'VOIDED';

CREATE TYPE "ClaimSeverity" AS ENUM ('MINOR', 'MODERATE', 'MAJOR', 'CATASTROPHIC');
CREATE TYPE "ClaimRecoveryPotential" AS ENUM ('NONE', 'SUBROGATION', 'SALVAGE', 'BOTH');
CREATE TYPE "ClaimQuerySource" AS ENUM ('INSURER', 'CLIENT', 'INTERNAL');
CREATE TYPE "ClaimQueryStatus" AS ENUM ('OPEN', 'RESPONDED', 'CLOSED', 'OVERDUE');
CREATE TYPE "ClaimSettlementStatus" AS ENUM ('EXPECTED', 'RECEIVED', 'DISBURSED', 'PARTIAL', 'CANCELLED');
CREATE TYPE "ClaimSettlementRecipient" AS ENUM ('CLIENT', 'SERVICE_PROVIDER', 'BROKER', 'OTHER');

ALTER TABLE "claims"
  ADD COLUMN "insurerId" TEXT,
  ADD COLUMN "productId" TEXT,
  ADD COLUMN "lossCategory" TEXT,
  ADD COLUMN "severity" "ClaimSeverity" NOT NULL DEFAULT 'MODERATE',
  ADD COLUMN "recoveryPotential" "ClaimRecoveryPotential" NOT NULL DEFAULT 'NONE',
  ADD COLUMN "amountAssessed" DECIMAL(15,2),
  ALTER COLUMN "amountClaimed" SET DEFAULT 0,
  ALTER COLUMN "amountPaid" SET DEFAULT 0,
  ADD COLUMN "settlementNotes" TEXT,
  ADD COLUMN "acknowledgementDueAt" TIMESTAMP(3),
  ADD COLUMN "documentsDueAt" TIMESTAMP(3),
  ADD COLUMN "submissionDueAt" TIMESTAMP(3),
  ADD COLUMN "insurerFollowUpDueAt" TIMESTAMP(3),
  ADD COLUMN "resolutionDueAt" TIMESTAMP(3),
  ADD COLUMN "withdrawnAt" TIMESTAMP(3),
  ADD COLUMN "voidedAt" TIMESTAMP(3),
  ADD COLUMN "voidReason" TEXT,
  ADD COLUMN "deletedAt" TIMESTAMP(3);

UPDATE "claims" c
SET "insurerId" = p."insurerId",
    "productId" = p."productId"
FROM "policies" p
WHERE c."policyId" = p."id" AND (c."insurerId" IS NULL OR c."productId" IS NULL);

ALTER TABLE "claims"
  ALTER COLUMN "insurerId" SET NOT NULL,
  ALTER COLUMN "productId" SET NOT NULL,
  ALTER COLUMN "amountPaid" SET NOT NULL;

ALTER TABLE "claim_documents"
  ADD COLUMN "requirementId" TEXT,
  ADD COLUMN "uploadedById" TEXT;

CREATE TABLE "claim_document_requirements" (
  "id" TEXT NOT NULL,
  "productId" TEXT,
  "insuranceClass" "InsuranceClass",
  "claimType" TEXT,
  "lossType" TEXT,
  "documentType" TEXT NOT NULL,
  "documentName" TEXT NOT NULL,
  "description" TEXT,
  "isRequired" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "claim_document_requirements_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "claim_queries" (
  "id" TEXT NOT NULL,
  "claimId" TEXT NOT NULL,
  "source" "ClaimQuerySource" NOT NULL,
  "queryText" TEXT NOT NULL,
  "requestedBy" TEXT,
  "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "dueDate" TIMESTAMP(3),
  "status" "ClaimQueryStatus" NOT NULL DEFAULT 'OPEN',
  "responseText" TEXT,
  "respondedAt" TIMESTAMP(3),
  "assignedToId" TEXT,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "claim_queries_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "claim_assessments" (
  "id" TEXT NOT NULL,
  "claimId" TEXT NOT NULL,
  "assessorName" TEXT,
  "assessorCompany" TEXT,
  "assessmentDate" TIMESTAMP(3) NOT NULL,
  "assessedAmount" DECIMAL(15,2),
  "recommendedSettlement" DECIMAL(15,2),
  "reportDocumentId" TEXT,
  "notes" TEXT,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "claim_assessments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "claim_settlements" (
  "id" TEXT NOT NULL,
  "claimId" TEXT NOT NULL,
  "amount" DECIMAL(15,2) NOT NULL,
  "settlementDate" TIMESTAMP(3),
  "expectedPaymentDate" TIMESTAMP(3),
  "paymentReceivedDate" TIMESTAMP(3),
  "paymentMethod" TEXT,
  "paymentReference" TEXT,
  "paidTo" "ClaimSettlementRecipient" NOT NULL DEFAULT 'CLIENT',
  "recipientName" TEXT,
  "status" "ClaimSettlementStatus" NOT NULL DEFAULT 'EXPECTED',
  "notes" TEXT,
  "accountingHook" JSONB,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "claim_settlements_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "claim_status_history" (
  "id" TEXT NOT NULL,
  "claimId" TEXT NOT NULL,
  "fromStatus" "ClaimStatus",
  "toStatus" "ClaimStatus" NOT NULL,
  "reason" TEXT,
  "changedById" TEXT,
  "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "metadata" JSONB,
  CONSTRAINT "claim_status_history_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "claims_insurerId_idx" ON "claims"("insurerId");
CREATE INDEX "claims_productId_idx" ON "claims"("productId");
CREATE INDEX "claims_dateReported_idx" ON "claims"("dateReported");
CREATE INDEX "claims_priority_idx" ON "claims"("priority");
CREATE INDEX "claim_documents_requirementId_idx" ON "claim_documents"("requirementId");
CREATE INDEX "claim_document_requirements_productId_idx" ON "claim_document_requirements"("productId");
CREATE INDEX "claim_document_requirements_insuranceClass_idx" ON "claim_document_requirements"("insuranceClass");
CREATE INDEX "claim_document_requirements_claimType_idx" ON "claim_document_requirements"("claimType");
CREATE INDEX "claim_document_requirements_lossType_idx" ON "claim_document_requirements"("lossType");
CREATE INDEX "claim_document_requirements_isActive_idx" ON "claim_document_requirements"("isActive");
CREATE INDEX "claim_queries_claimId_idx" ON "claim_queries"("claimId");
CREATE INDEX "claim_queries_status_idx" ON "claim_queries"("status");
CREATE INDEX "claim_queries_dueDate_idx" ON "claim_queries"("dueDate");
CREATE INDEX "claim_queries_assignedToId_idx" ON "claim_queries"("assignedToId");
CREATE INDEX "claim_assessments_claimId_idx" ON "claim_assessments"("claimId");
CREATE INDEX "claim_assessments_assessmentDate_idx" ON "claim_assessments"("assessmentDate");
CREATE INDEX "claim_settlements_claimId_idx" ON "claim_settlements"("claimId");
CREATE INDEX "claim_settlements_status_idx" ON "claim_settlements"("status");
CREATE INDEX "claim_settlements_settlementDate_idx" ON "claim_settlements"("settlementDate");
CREATE INDEX "claim_settlements_expectedPaymentDate_idx" ON "claim_settlements"("expectedPaymentDate");
CREATE INDEX "claim_status_history_claimId_idx" ON "claim_status_history"("claimId");
CREATE INDEX "claim_status_history_toStatus_idx" ON "claim_status_history"("toStatus");
CREATE INDEX "claim_status_history_changedAt_idx" ON "claim_status_history"("changedAt");

ALTER TABLE "claims" ADD CONSTRAINT "claims_insurerId_fkey"
  FOREIGN KEY ("insurerId") REFERENCES "insurers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "claims" ADD CONSTRAINT "claims_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "claim_documents" ADD CONSTRAINT "claim_documents_requirementId_fkey"
  FOREIGN KEY ("requirementId") REFERENCES "claim_document_requirements"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "claim_document_requirements" ADD CONSTRAINT "claim_document_requirements_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "claim_queries" ADD CONSTRAINT "claim_queries_claimId_fkey"
  FOREIGN KEY ("claimId") REFERENCES "claims"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "claim_assessments" ADD CONSTRAINT "claim_assessments_claimId_fkey"
  FOREIGN KEY ("claimId") REFERENCES "claims"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "claim_settlements" ADD CONSTRAINT "claim_settlements_claimId_fkey"
  FOREIGN KEY ("claimId") REFERENCES "claims"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "claim_status_history" ADD CONSTRAINT "claim_status_history_claimId_fkey"
  FOREIGN KEY ("claimId") REFERENCES "claims"("id") ON DELETE CASCADE ON UPDATE CASCADE;
