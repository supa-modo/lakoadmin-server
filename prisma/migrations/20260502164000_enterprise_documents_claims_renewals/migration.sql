-- Enterprise document management, claim query threads, and renewal reminder idempotency.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ClaimQueryType') THEN
    CREATE TYPE "ClaimQueryType" AS ENUM ('DOCUMENT_REQUEST', 'CLARIFICATION', 'ASSESSMENT_QUERY', 'SETTLEMENT_QUERY', 'GENERAL');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ClaimQueryResponseSource') THEN
    CREATE TYPE "ClaimQueryResponseSource" AS ENUM ('CLIENT', 'INSURER', 'INTERNAL');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'DocumentStatus') THEN
    CREATE TYPE "DocumentStatus" AS ENUM ('DRAFT', 'UPLOADED', 'VERIFIED', 'REJECTED', 'EXPIRED', 'ARCHIVED', 'VOIDED');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'DocumentVisibility') THEN
    CREATE TYPE "DocumentVisibility" AS ENUM ('INTERNAL', 'CLIENT_VISIBLE', 'INSURER_VISIBLE');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'RenewalReminderStatus') THEN
    CREATE TYPE "RenewalReminderStatus" AS ENUM ('CREATED', 'QUEUED', 'SENT', 'SKIPPED', 'FAILED');
  END IF;
END $$;

ALTER TYPE "ClaimQueryStatus" ADD VALUE IF NOT EXISTS 'CLIENT_RESPONSE_PENDING';
ALTER TYPE "ClaimQueryStatus" ADD VALUE IF NOT EXISTS 'SUBMITTED_TO_INSURER';

ALTER TABLE "documents"
  ADD COLUMN IF NOT EXISTS "policyId" TEXT,
  ADD COLUMN IF NOT EXISTS "claimId" TEXT,
  ADD COLUMN IF NOT EXISTS "paymentId" TEXT,
  ADD COLUMN IF NOT EXISTS "onboardingCaseId" TEXT,
  ADD COLUMN IF NOT EXISTS "expenseId" TEXT,
  ADD COLUMN IF NOT EXISTS "insurerId" TEXT,
  ADD COLUMN IF NOT EXISTS "title" TEXT,
  ADD COLUMN IF NOT EXISTS "documentType" TEXT,
  ADD COLUMN IF NOT EXISTS "fileName" TEXT,
  ADD COLUMN IF NOT EXISTS "originalFileName" TEXT,
  ADD COLUMN IF NOT EXISTS "storageKey" TEXT,
  ADD COLUMN IF NOT EXISTS "checksum" TEXT,
  ADD COLUMN IF NOT EXISTS "status" "DocumentStatus" NOT NULL DEFAULT 'UPLOADED',
  ADD COLUMN IF NOT EXISTS "visibility" "DocumentVisibility" NOT NULL DEFAULT 'INTERNAL',
  ADD COLUMN IF NOT EXISTS "sourceModule" TEXT,
  ADD COLUMN IF NOT EXISTS "relatedEntityType" TEXT,
  ADD COLUMN IF NOT EXISTS "relatedEntityId" TEXT,
  ADD COLUMN IF NOT EXISTS "parentDocumentId" TEXT,
  ADD COLUMN IF NOT EXISTS "uploadedById" TEXT,
  ADD COLUMN IF NOT EXISTS "rejectedById" TEXT,
  ADD COLUMN IF NOT EXISTS "rejectedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "rejectionReason" TEXT,
  ADD COLUMN IF NOT EXISTS "metadata" JSONB;

UPDATE "documents"
SET
  "title" = COALESCE("title", "name"),
  "documentType" = COALESCE("documentType", "type"),
  "fileName" = COALESCE("fileName", regexp_replace("fileUrl", '^.*[\\/]', '')),
  "originalFileName" = COALESCE("originalFileName", "name"),
  "uploadedById" = COALESCE("uploadedById", "createdById"),
  "relatedEntityType" = COALESCE("relatedEntityType", "entityType"),
  "relatedEntityId" = COALESCE("relatedEntityId", "entityId"),
  "sourceModule" = COALESCE("sourceModule", lower("category")),
  "status" = CASE
    WHEN "isVerified" = true THEN 'VERIFIED'::"DocumentStatus"
    ELSE "status"
  END;

CREATE INDEX IF NOT EXISTS "documents_relatedEntityType_relatedEntityId_idx" ON "documents"("relatedEntityType", "relatedEntityId");
CREATE INDEX IF NOT EXISTS "documents_policyId_idx" ON "documents"("policyId");
CREATE INDEX IF NOT EXISTS "documents_claimId_idx" ON "documents"("claimId");
CREATE INDEX IF NOT EXISTS "documents_paymentId_idx" ON "documents"("paymentId");
CREATE INDEX IF NOT EXISTS "documents_onboardingCaseId_idx" ON "documents"("onboardingCaseId");
CREATE INDEX IF NOT EXISTS "documents_insurerId_idx" ON "documents"("insurerId");
CREATE INDEX IF NOT EXISTS "documents_documentType_idx" ON "documents"("documentType");
CREATE INDEX IF NOT EXISTS "documents_status_idx" ON "documents"("status");
CREATE INDEX IF NOT EXISTS "documents_visibility_idx" ON "documents"("visibility");
CREATE INDEX IF NOT EXISTS "documents_sourceModule_idx" ON "documents"("sourceModule");

CREATE TABLE IF NOT EXISTS "document_activities" (
  "id" TEXT NOT NULL,
  "documentId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "performedById" TEXT,
  "notes" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "document_activities_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "document_activities_documentId_idx" ON "document_activities"("documentId");
CREATE INDEX IF NOT EXISTS "document_activities_action_idx" ON "document_activities"("action");
CREATE INDEX IF NOT EXISTS "document_activities_performedById_idx" ON "document_activities"("performedById");
CREATE INDEX IF NOT EXISTS "document_activities_createdAt_idx" ON "document_activities"("createdAt");
ALTER TABLE "document_activities" DROP CONSTRAINT IF EXISTS "document_activities_documentId_fkey";
ALTER TABLE "document_activities" ADD CONSTRAINT "document_activities_documentId_fkey"
  FOREIGN KEY ("documentId") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "document_requirements" (
  "id" TEXT NOT NULL,
  "module" TEXT NOT NULL,
  "entityType" TEXT NOT NULL,
  "productId" TEXT,
  "insuranceClass" "InsuranceClass",
  "clientType" "ClientType",
  "claimType" TEXT,
  "documentType" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "isRequired" BOOLEAN NOT NULL DEFAULT true,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "document_requirements_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "document_requirements_module_idx" ON "document_requirements"("module");
CREATE INDEX IF NOT EXISTS "document_requirements_entityType_idx" ON "document_requirements"("entityType");
CREATE INDEX IF NOT EXISTS "document_requirements_productId_idx" ON "document_requirements"("productId");
CREATE INDEX IF NOT EXISTS "document_requirements_insuranceClass_idx" ON "document_requirements"("insuranceClass");
CREATE INDEX IF NOT EXISTS "document_requirements_clientType_idx" ON "document_requirements"("clientType");
CREATE INDEX IF NOT EXISTS "document_requirements_claimType_idx" ON "document_requirements"("claimType");
CREATE INDEX IF NOT EXISTS "document_requirements_documentType_idx" ON "document_requirements"("documentType");
CREATE INDEX IF NOT EXISTS "document_requirements_isActive_idx" ON "document_requirements"("isActive");

ALTER TABLE "claim_queries"
  ADD COLUMN IF NOT EXISTS "querySource" "ClaimQuerySource",
  ADD COLUMN IF NOT EXISTS "queryType" "ClaimQueryType" NOT NULL DEFAULT 'GENERAL',
  ADD COLUMN IF NOT EXISTS "raisedByName" TEXT,
  ADD COLUMN IF NOT EXISTS "raisedByUserId" TEXT,
  ADD COLUMN IF NOT EXISTS "raisedByExternalParty" TEXT,
  ADD COLUMN IF NOT EXISTS "priority" "TaskPriority" NOT NULL DEFAULT 'NORMAL',
  ADD COLUMN IF NOT EXISTS "insurerReference" TEXT,
  ADD COLUMN IF NOT EXISTS "submittedToInsurerAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "closedAt" TIMESTAMP(3);

UPDATE "claim_queries"
SET
  "querySource" = COALESCE("querySource", "source"),
  "raisedByName" = COALESCE("raisedByName", "requestedBy"),
  "closedAt" = CASE WHEN "status" = 'CLOSED' THEN COALESCE("closedAt", "updatedAt") ELSE "closedAt" END;

CREATE INDEX IF NOT EXISTS "claim_queries_queryType_idx" ON "claim_queries"("queryType");
CREATE INDEX IF NOT EXISTS "claim_queries_priority_idx" ON "claim_queries"("priority");

CREATE TABLE IF NOT EXISTS "claim_query_responses" (
  "id" TEXT NOT NULL,
  "claimQueryId" TEXT NOT NULL,
  "responseSource" "ClaimQueryResponseSource" NOT NULL,
  "responseText" TEXT NOT NULL,
  "respondedByUserId" TEXT,
  "respondedByName" TEXT,
  "responseDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "submittedToInsurerAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "claim_query_responses_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "claim_query_responses_claimQueryId_idx" ON "claim_query_responses"("claimQueryId");
CREATE INDEX IF NOT EXISTS "claim_query_responses_responseSource_idx" ON "claim_query_responses"("responseSource");
CREATE INDEX IF NOT EXISTS "claim_query_responses_responseDate_idx" ON "claim_query_responses"("responseDate");
ALTER TABLE "claim_query_responses" DROP CONSTRAINT IF EXISTS "claim_query_responses_claimQueryId_fkey";
ALTER TABLE "claim_query_responses" ADD CONSTRAINT "claim_query_responses_claimQueryId_fkey"
  FOREIGN KEY ("claimQueryId") REFERENCES "claim_queries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "_ClaimQueryResponseDocuments" (
  "A" TEXT NOT NULL,
  "B" TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "_ClaimQueryResponseDocuments_AB_unique" ON "_ClaimQueryResponseDocuments"("A", "B");
CREATE INDEX IF NOT EXISTS "_ClaimQueryResponseDocuments_B_index" ON "_ClaimQueryResponseDocuments"("B");
ALTER TABLE "_ClaimQueryResponseDocuments" DROP CONSTRAINT IF EXISTS "_ClaimQueryResponseDocuments_A_fkey";
ALTER TABLE "_ClaimQueryResponseDocuments" ADD CONSTRAINT "_ClaimQueryResponseDocuments_A_fkey"
  FOREIGN KEY ("A") REFERENCES "claim_query_responses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "_ClaimQueryResponseDocuments" DROP CONSTRAINT IF EXISTS "_ClaimQueryResponseDocuments_B_fkey";
ALTER TABLE "_ClaimQueryResponseDocuments" ADD CONSTRAINT "_ClaimQueryResponseDocuments_B_fkey"
  FOREIGN KEY ("B") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "claimQueryId" TEXT;
CREATE INDEX IF NOT EXISTS "tasks_claimQueryId_idx" ON "tasks"("claimQueryId");
ALTER TABLE "tasks" DROP CONSTRAINT IF EXISTS "tasks_claimQueryId_fkey";
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_claimQueryId_fkey"
  FOREIGN KEY ("claimQueryId") REFERENCES "claim_queries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "renewal_reminder_logs" (
  "id" TEXT NOT NULL,
  "policyId" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "cadenceDays" INTEGER NOT NULL,
  "reminderDate" TIMESTAMP(3) NOT NULL,
  "channel" "MessageChannel" NOT NULL,
  "status" "RenewalReminderStatus" NOT NULL DEFAULT 'CREATED',
  "messageLogId" TEXT,
  "taskId" TEXT,
  "errorMessage" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "renewal_reminder_logs_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "renewal_reminder_logs_policyId_cadenceDays_reminderDate_channel_key"
  ON "renewal_reminder_logs"("policyId", "cadenceDays", "reminderDate", "channel");
CREATE INDEX IF NOT EXISTS "renewal_reminder_logs_policyId_idx" ON "renewal_reminder_logs"("policyId");
CREATE INDEX IF NOT EXISTS "renewal_reminder_logs_clientId_idx" ON "renewal_reminder_logs"("clientId");
CREATE INDEX IF NOT EXISTS "renewal_reminder_logs_cadenceDays_idx" ON "renewal_reminder_logs"("cadenceDays");
CREATE INDEX IF NOT EXISTS "renewal_reminder_logs_reminderDate_idx" ON "renewal_reminder_logs"("reminderDate");
CREATE INDEX IF NOT EXISTS "renewal_reminder_logs_status_idx" ON "renewal_reminder_logs"("status");
