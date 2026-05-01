-- CreateEnum
CREATE TYPE "MessageDirection" AS ENUM ('OUTBOUND', 'INBOUND');

-- CreateEnum
CREATE TYPE "MessagePriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "MessageRecipientType" AS ENUM ('CLIENT', 'USER', 'CUSTOM', 'CONTACT_PERSON', 'AGENT');

-- CreateEnum
CREATE TYPE "CommunicationCampaignStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'SENDING', 'SENT', 'PARTIALLY_FAILED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CommunicationAudienceType" AS ENUM ('CLIENTS', 'USERS', 'AGENTS', 'CUSTOM', 'MIXED');

-- CreateEnum
CREATE TYPE "AutomationTriggerType" AS ENUM ('CLIENT_CREATED', 'ONBOARDING_DOCUMENT_MISSING', 'POLICY_CREATED', 'POLICY_ACTIVATED', 'POLICY_RENEWAL_UPCOMING', 'PAYMENT_DUE', 'PAYMENT_RECEIVED', 'DIRECT_INSURER_PAYMENT_PENDING_VERIFICATION', 'CLAIM_REGISTERED', 'CLAIM_DOCUMENTS_MISSING', 'CLAIM_STATUS_CHANGED', 'SETTLEMENT_PENDING', 'SETTLEMENT_RECEIVED', 'TASK_DUE_SOON', 'TASK_OVERDUE', 'COMMISSION_APPROVED', 'COMMISSION_PAID');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "MessageCategory" ADD VALUE 'GENERAL';
ALTER TYPE "MessageCategory" ADD VALUE 'INTERNAL';
ALTER TYPE "MessageCategory" ADD VALUE 'CLIENT_WELCOME';
ALTER TYPE "MessageCategory" ADD VALUE 'ONBOARDING_DOCUMENT_REQUEST';
ALTER TYPE "MessageCategory" ADD VALUE 'POLICY_CREATED';
ALTER TYPE "MessageCategory" ADD VALUE 'POLICY_ACTIVATED';
ALTER TYPE "MessageCategory" ADD VALUE 'POLICY_RENEWAL_REMINDER';
ALTER TYPE "MessageCategory" ADD VALUE 'PAYMENT_REMINDER';
ALTER TYPE "MessageCategory" ADD VALUE 'PAYMENT_RECEIPT';
ALTER TYPE "MessageCategory" ADD VALUE 'DIRECT_INSURER_PAYMENT_ACKNOWLEDGEMENT';
ALTER TYPE "MessageCategory" ADD VALUE 'CLAIM_REGISTERED';
ALTER TYPE "MessageCategory" ADD VALUE 'CLAIM_DOCUMENT_REQUEST';
ALTER TYPE "MessageCategory" ADD VALUE 'CLAIM_SUBMITTED';
ALTER TYPE "MessageCategory" ADD VALUE 'CLAIM_STATUS_UPDATE';
ALTER TYPE "MessageCategory" ADD VALUE 'CLAIM_SETTLEMENT_UPDATE';
ALTER TYPE "MessageCategory" ADD VALUE 'TASK_REMINDER';
ALTER TYPE "MessageCategory" ADD VALUE 'COMMISSION_NOTIFICATION';
ALTER TYPE "MessageCategory" ADD VALUE 'ACCOUNTING_NOTIFICATION';
ALTER TYPE "MessageCategory" ADD VALUE 'HOLIDAY_GREETING';
ALTER TYPE "MessageCategory" ADD VALUE 'BIRTHDAY_GREETING';
ALTER TYPE "MessageCategory" ADD VALUE 'CUSTOM';

-- AlterEnum
ALTER TYPE "MessageChannel" ADD VALUE 'INTERNAL_NOTIFICATION';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "MessageStatus" ADD VALUE 'DRAFT';
ALTER TYPE "MessageStatus" ADD VALUE 'SCHEDULED';
ALTER TYPE "MessageStatus" ADD VALUE 'SENDING';
ALTER TYPE "MessageStatus" ADD VALUE 'CANCELLED';
ALTER TYPE "MessageStatus" ADD VALUE 'PARTIALLY_FAILED';
ALTER TYPE "MessageStatus" ADD VALUE 'READ';

-- AlterTable
ALTER TABLE "claim_assessments" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "claim_document_requirements" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "claim_queries" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "claim_settlements" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "message_logs" ADD COLUMN     "campaignId" TEXT,
ADD COLUMN     "claimId" TEXT,
ADD COLUMN     "clientId" TEXT,
ADD COLUMN     "createdById" TEXT,
ADD COLUMN     "direction" "MessageDirection" NOT NULL DEFAULT 'OUTBOUND',
ADD COLUMN     "entityId" TEXT,
ADD COLUMN     "entityType" TEXT,
ADD COLUMN     "failureReason" TEXT,
ADD COLUMN     "messageType" TEXT NOT NULL DEFAULT 'MANUAL',
ADD COLUMN     "onboardingCaseId" TEXT,
ADD COLUMN     "paymentId" TEXT,
ADD COLUMN     "policyId" TEXT,
ADD COLUMN     "priority" "MessagePriority" NOT NULL DEFAULT 'NORMAL',
ADD COLUMN     "provider" TEXT,
ADD COLUMN     "providerMessageId" TEXT,
ADD COLUMN     "providerResponse" JSONB,
ADD COLUMN     "relatedEntityId" TEXT,
ADD COLUMN     "relatedEntityType" TEXT,
ADD COLUMN     "scheduledAt" TIMESTAMP(3),
ADD COLUMN     "taskId" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "userId" TEXT,
ALTER COLUMN "recipientAddress" DROP NOT NULL,
ALTER COLUMN "status" DROP DEFAULT;

-- AlterTable
ALTER TABLE "message_templates" ADD COLUMN     "createdById" TEXT,
ADD COLUMN     "updatedById" TEXT,
ADD COLUMN     "variables" JSONB,
ALTER COLUMN "placeholders" SET DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "notifications" ADD COLUMN     "relatedEntityId" TEXT,
ADD COLUMN     "relatedEntityType" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "reconciliation_matches" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- CreateTable
CREATE TABLE "message_recipients" (
    "id" TEXT NOT NULL,
    "messageLogId" TEXT NOT NULL,
    "recipientType" "MessageRecipientType" NOT NULL,
    "recipientName" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "clientId" TEXT,
    "userId" TEXT,
    "agentId" TEXT,
    "contactPersonId" TEXT,
    "status" "MessageStatus" NOT NULL DEFAULT 'QUEUED',
    "sentAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "failureReason" TEXT,
    "providerMessageId" TEXT,
    "providerResponse" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "message_recipients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "communication_campaigns" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "channel" "MessageChannel" NOT NULL,
    "category" "MessageCategory" NOT NULL,
    "audienceType" "CommunicationAudienceType" NOT NULL,
    "status" "CommunicationCampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "templateId" TEXT,
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "filters" JSONB,
    "scheduledAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "createdById" TEXT,
    "totalRecipients" INTEGER NOT NULL DEFAULT 0,
    "successfulCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "communication_campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "communication_preferences" (
    "id" TEXT NOT NULL,
    "clientId" TEXT,
    "userId" TEXT,
    "channel" "MessageChannel" NOT NULL,
    "category" "MessageCategory" NOT NULL,
    "isOptedIn" BOOLEAN NOT NULL DEFAULT true,
    "optedOutAt" TIMESTAMP(3),
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "communication_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "automation_rules" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "triggerType" "AutomationTriggerType" NOT NULL,
    "channel" "MessageChannel" NOT NULL,
    "templateId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "conditions" JSONB,
    "scheduleConfig" JSONB,
    "recipientConfig" JSONB,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "automation_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inbound_messages" (
    "id" TEXT NOT NULL,
    "channel" "MessageChannel" NOT NULL,
    "fromAddress" TEXT NOT NULL,
    "toAddress" TEXT,
    "body" TEXT NOT NULL,
    "provider" TEXT,
    "providerMessageId" TEXT,
    "providerResponse" JSONB,
    "matchedClientId" TEXT,
    "relatedEntityType" TEXT,
    "relatedEntityId" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inbound_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "whatsapp_sessions" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "clientId" TEXT,
    "provider" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "lastMessageAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_events" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "providerEventId" TEXT,
    "payload" JSONB NOT NULL,
    "processedAt" TIMESTAMP(3),
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "message_recipients_messageLogId_idx" ON "message_recipients"("messageLogId");

-- CreateIndex
CREATE INDEX "message_recipients_recipientType_idx" ON "message_recipients"("recipientType");

-- CreateIndex
CREATE INDEX "message_recipients_clientId_idx" ON "message_recipients"("clientId");

-- CreateIndex
CREATE INDEX "message_recipients_userId_idx" ON "message_recipients"("userId");

-- CreateIndex
CREATE INDEX "message_recipients_agentId_idx" ON "message_recipients"("agentId");

-- CreateIndex
CREATE INDEX "message_recipients_status_idx" ON "message_recipients"("status");

-- CreateIndex
CREATE INDEX "message_recipients_providerMessageId_idx" ON "message_recipients"("providerMessageId");

-- CreateIndex
CREATE INDEX "communication_campaigns_channel_idx" ON "communication_campaigns"("channel");

-- CreateIndex
CREATE INDEX "communication_campaigns_category_idx" ON "communication_campaigns"("category");

-- CreateIndex
CREATE INDEX "communication_campaigns_audienceType_idx" ON "communication_campaigns"("audienceType");

-- CreateIndex
CREATE INDEX "communication_campaigns_status_idx" ON "communication_campaigns"("status");

-- CreateIndex
CREATE INDEX "communication_campaigns_templateId_idx" ON "communication_campaigns"("templateId");

-- CreateIndex
CREATE INDEX "communication_campaigns_createdById_idx" ON "communication_campaigns"("createdById");

-- CreateIndex
CREATE INDEX "communication_campaigns_scheduledAt_idx" ON "communication_campaigns"("scheduledAt");

-- CreateIndex
CREATE INDEX "communication_campaigns_createdAt_idx" ON "communication_campaigns"("createdAt");

-- CreateIndex
CREATE INDEX "communication_preferences_clientId_idx" ON "communication_preferences"("clientId");

-- CreateIndex
CREATE INDEX "communication_preferences_userId_idx" ON "communication_preferences"("userId");

-- CreateIndex
CREATE INDEX "communication_preferences_channel_idx" ON "communication_preferences"("channel");

-- CreateIndex
CREATE INDEX "communication_preferences_category_idx" ON "communication_preferences"("category");

-- CreateIndex
CREATE UNIQUE INDEX "communication_preferences_clientId_channel_category_key" ON "communication_preferences"("clientId", "channel", "category");

-- CreateIndex
CREATE UNIQUE INDEX "communication_preferences_userId_channel_category_key" ON "communication_preferences"("userId", "channel", "category");

-- CreateIndex
CREATE INDEX "automation_rules_triggerType_idx" ON "automation_rules"("triggerType");

-- CreateIndex
CREATE INDEX "automation_rules_channel_idx" ON "automation_rules"("channel");

-- CreateIndex
CREATE INDEX "automation_rules_templateId_idx" ON "automation_rules"("templateId");

-- CreateIndex
CREATE INDEX "automation_rules_isActive_idx" ON "automation_rules"("isActive");

-- CreateIndex
CREATE INDEX "inbound_messages_channel_idx" ON "inbound_messages"("channel");

-- CreateIndex
CREATE INDEX "inbound_messages_fromAddress_idx" ON "inbound_messages"("fromAddress");

-- CreateIndex
CREATE INDEX "inbound_messages_matchedClientId_idx" ON "inbound_messages"("matchedClientId");

-- CreateIndex
CREATE INDEX "inbound_messages_providerMessageId_idx" ON "inbound_messages"("providerMessageId");

-- CreateIndex
CREATE INDEX "inbound_messages_receivedAt_idx" ON "inbound_messages"("receivedAt");

-- CreateIndex
CREATE INDEX "whatsapp_sessions_phone_idx" ON "whatsapp_sessions"("phone");

-- CreateIndex
CREATE INDEX "whatsapp_sessions_clientId_idx" ON "whatsapp_sessions"("clientId");

-- CreateIndex
CREATE INDEX "whatsapp_sessions_status_idx" ON "whatsapp_sessions"("status");

-- CreateIndex
CREATE INDEX "webhook_events_provider_idx" ON "webhook_events"("provider");

-- CreateIndex
CREATE INDEX "webhook_events_eventType_idx" ON "webhook_events"("eventType");

-- CreateIndex
CREATE INDEX "webhook_events_providerEventId_idx" ON "webhook_events"("providerEventId");

-- CreateIndex
CREATE INDEX "webhook_events_processedAt_idx" ON "webhook_events"("processedAt");

-- CreateIndex
CREATE INDEX "message_logs_campaignId_idx" ON "message_logs"("campaignId");

-- CreateIndex
CREATE INDEX "message_logs_clientId_idx" ON "message_logs"("clientId");

-- CreateIndex
CREATE INDEX "message_logs_policyId_idx" ON "message_logs"("policyId");

-- CreateIndex
CREATE INDEX "message_logs_claimId_idx" ON "message_logs"("claimId");

-- CreateIndex
CREATE INDEX "message_logs_taskId_idx" ON "message_logs"("taskId");

-- CreateIndex
CREATE INDEX "message_logs_onboardingCaseId_idx" ON "message_logs"("onboardingCaseId");

-- CreateIndex
CREATE INDEX "message_logs_paymentId_idx" ON "message_logs"("paymentId");

-- CreateIndex
CREATE INDEX "message_logs_userId_idx" ON "message_logs"("userId");

-- CreateIndex
CREATE INDEX "message_logs_scheduledAt_idx" ON "message_logs"("scheduledAt");

-- CreateIndex
CREATE INDEX "message_logs_providerMessageId_idx" ON "message_logs"("providerMessageId");

-- CreateIndex
CREATE INDEX "message_templates_createdById_idx" ON "message_templates"("createdById");

-- CreateIndex
CREATE INDEX "notifications_relatedEntityType_relatedEntityId_idx" ON "notifications"("relatedEntityType", "relatedEntityId");

-- AddForeignKey
ALTER TABLE "message_templates" ADD CONSTRAINT "message_templates_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_templates" ADD CONSTRAINT "message_templates_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_logs" ADD CONSTRAINT "message_logs_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_logs" ADD CONSTRAINT "message_logs_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "communication_campaigns"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_logs" ADD CONSTRAINT "message_logs_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_logs" ADD CONSTRAINT "message_logs_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "policies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_logs" ADD CONSTRAINT "message_logs_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "claims"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_logs" ADD CONSTRAINT "message_logs_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_logs" ADD CONSTRAINT "message_logs_onboardingCaseId_fkey" FOREIGN KEY ("onboardingCaseId") REFERENCES "onboarding_cases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_logs" ADD CONSTRAINT "message_logs_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_logs" ADD CONSTRAINT "message_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_recipients" ADD CONSTRAINT "message_recipients_messageLogId_fkey" FOREIGN KEY ("messageLogId") REFERENCES "message_logs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_recipients" ADD CONSTRAINT "message_recipients_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_recipients" ADD CONSTRAINT "message_recipients_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_recipients" ADD CONSTRAINT "message_recipients_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "agents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_recipients" ADD CONSTRAINT "message_recipients_contactPersonId_fkey" FOREIGN KEY ("contactPersonId") REFERENCES "client_contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_campaigns" ADD CONSTRAINT "communication_campaigns_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "message_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_campaigns" ADD CONSTRAINT "communication_campaigns_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_preferences" ADD CONSTRAINT "communication_preferences_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_preferences" ADD CONSTRAINT "communication_preferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automation_rules" ADD CONSTRAINT "automation_rules_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "message_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automation_rules" ADD CONSTRAINT "automation_rules_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "reconciliation_matches_reconciliationItemId_financeTransactionI" RENAME TO "reconciliation_matches_reconciliationItemId_financeTransact_key";

