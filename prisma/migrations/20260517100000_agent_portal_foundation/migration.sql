-- CreateEnum
CREATE TYPE "LeadProposalStatus" AS ENUM ('DRAFT', 'SENT', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'CONVERTED');

-- CreateEnum
CREATE TYPE "AgentCommissionAppliesTo" AS ENUM ('ALL_AGENTS', 'SPECIFIC_AGENT', 'PRODUCT', 'INSURER', 'POLICY_TYPE');

-- CreateEnum
CREATE TYPE "AgentCommissionCalcType" AS ENUM ('FIXED_AMOUNT', 'PERCENTAGE_OF_PREMIUM', 'MANUAL_AMOUNT', 'TIERED');

-- CreateEnum
CREATE TYPE "AgentCommissionStatus" AS ENUM ('PENDING', 'APPROVED', 'PAYABLE', 'PAID', 'CANCELLED', 'REVERSED');

-- CreateEnum
CREATE TYPE "AgentCommissionSourceType" AS ENUM ('POLICY_ACTIVATION', 'PREMIUM_PAYMENT', 'MANUAL_ADJUSTMENT', 'RENEWAL', 'REVERSAL');

-- CreateEnum
CREATE TYPE "AgentCommissionRuleStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "LeadCommunicationType" AS ENUM ('CALL', 'SMS', 'EMAIL', 'WHATSAPP', 'MEETING', 'NOTE');

-- CreateEnum
CREATE TYPE "CommunicationDirection" AS ENUM ('INBOUND', 'OUTBOUND');

-- AlterTable leads
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "agentId" TEXT;
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "assignedByUserId" TEXT;
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "assignedAt" TIMESTAMP(3);
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "stage" TEXT;

CREATE INDEX IF NOT EXISTS "leads_agentId_idx" ON "leads"("agentId");

ALTER TABLE "leads" ADD CONSTRAINT "leads_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "agents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable clients
ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "agentId" TEXT;
ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "convertedFromLeadId" TEXT;
ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "onboardedByUserId" TEXT;
ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "onboardedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "clients_agentId_idx" ON "clients"("agentId");

ALTER TABLE "clients" ADD CONSTRAINT "clients_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "agents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable policies (columns only; FK after lead_proposals)
ALTER TABLE "policies" ADD COLUMN IF NOT EXISTS "convertedFromProposalId" TEXT;
ALTER TABLE "policies" ADD COLUMN IF NOT EXISTS "onboardedByUserId" TEXT;

-- AlterTable lead_communications
ALTER TABLE "lead_communications" ADD COLUMN IF NOT EXISTS "agentId" TEXT;
ALTER TABLE "lead_communications" ADD COLUMN IF NOT EXISTS "communicationType" "LeadCommunicationType" NOT NULL DEFAULT 'NOTE';
ALTER TABLE "lead_communications" ADD COLUMN IF NOT EXISTS "message" TEXT;
ALTER TABLE "lead_communications" ADD COLUMN IF NOT EXISTS "outcome" TEXT;
ALTER TABLE "lead_communications" ADD COLUMN IF NOT EXISTS "followUpRequired" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "lead_communications" ADD COLUMN IF NOT EXISTS "followUpDate" TIMESTAMP(3);

-- Migrate direction to enum if column exists as text
DO $$ BEGIN
  ALTER TABLE "lead_communications" ALTER COLUMN "direction" TYPE "CommunicationDirection" USING (
    CASE UPPER(COALESCE("direction", 'OUTBOUND'))
      WHEN 'INBOUND' THEN 'INBOUND'::"CommunicationDirection"
      ELSE 'OUTBOUND'::"CommunicationDirection"
    END
  );
EXCEPTION
  WHEN others THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "lead_communications_agentId_idx" ON "lead_communications"("agentId");

ALTER TABLE "lead_communications" ADD CONSTRAINT "lead_communications_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "agents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable lead_proposals
CREATE TABLE IF NOT EXISTS "lead_proposals" (
    "id" TEXT NOT NULL,
    "proposalNumber" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "productId" TEXT,
    "insurerId" TEXT,
    "premiumAmount" DECIMAL(15,2) NOT NULL,
    "coverSummary" TEXT,
    "benefitsSummary" TEXT,
    "exclusionsSummary" TEXT,
    "status" "LeadProposalStatus" NOT NULL DEFAULT 'DRAFT',
    "sentAt" TIMESTAMP(3),
    "acceptedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "documentUrl" TEXT,
    "notes" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lead_proposals_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "lead_proposals_proposalNumber_key" ON "lead_proposals"("proposalNumber");
CREATE INDEX IF NOT EXISTS "lead_proposals_leadId_idx" ON "lead_proposals"("leadId");
CREATE INDEX IF NOT EXISTS "lead_proposals_agentId_idx" ON "lead_proposals"("agentId");
CREATE INDEX IF NOT EXISTS "lead_proposals_status_idx" ON "lead_proposals"("status");

ALTER TABLE "lead_proposals" ADD CONSTRAINT "lead_proposals_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "lead_proposals" ADD CONSTRAINT "lead_proposals_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "lead_proposals" ADD CONSTRAINT "lead_proposals_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "lead_proposals" ADD CONSTRAINT "lead_proposals_insurerId_fkey" FOREIGN KEY ("insurerId") REFERENCES "insurers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

DO $$ BEGIN
  ALTER TABLE "policies" ADD CONSTRAINT "policies_convertedFromProposalId_fkey" FOREIGN KEY ("convertedFromProposalId") REFERENCES "lead_proposals"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- CreateTable agent_commission_rules
CREATE TABLE IF NOT EXISTS "agent_commission_rules" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "agentId" TEXT,
    "productId" TEXT,
    "insurerId" TEXT,
    "appliesTo" "AgentCommissionAppliesTo" NOT NULL DEFAULT 'ALL_AGENTS',
    "calculationType" "AgentCommissionCalcType" NOT NULL DEFAULT 'PERCENTAGE_OF_PREMIUM',
    "fixedAmount" DECIMAL(15,2),
    "percentageRate" DECIMAL(5,4),
    "minPremium" DECIMAL(15,2),
    "maxPremium" DECIMAL(15,2),
    "status" "AgentCommissionRuleStatus" NOT NULL DEFAULT 'ACTIVE',
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_commission_rules_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "agent_commission_rules_agentId_idx" ON "agent_commission_rules"("agentId");
CREATE INDEX IF NOT EXISTS "agent_commission_rules_productId_idx" ON "agent_commission_rules"("productId");
CREATE INDEX IF NOT EXISTS "agent_commission_rules_insurerId_idx" ON "agent_commission_rules"("insurerId");
CREATE INDEX IF NOT EXISTS "agent_commission_rules_status_idx" ON "agent_commission_rules"("status");

ALTER TABLE "agent_commission_rules" ADD CONSTRAINT "agent_commission_rules_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "agent_commission_rules" ADD CONSTRAINT "agent_commission_rules_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "agent_commission_rules" ADD CONSTRAINT "agent_commission_rules_insurerId_fkey" FOREIGN KEY ("insurerId") REFERENCES "insurers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable agent_commissions
CREATE TABLE IF NOT EXISTS "agent_commissions" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "clientId" TEXT,
    "policyId" TEXT NOT NULL,
    "leadId" TEXT,
    "premiumAmount" DECIMAL(15,2) NOT NULL,
    "commissionRuleId" TEXT,
    "calculationType" "AgentCommissionCalcType" NOT NULL,
    "commissionRate" DECIMAL(5,4),
    "commissionAmount" DECIMAL(15,2) NOT NULL,
    "status" "AgentCommissionStatus" NOT NULL DEFAULT 'PENDING',
    "sourceType" "AgentCommissionSourceType" NOT NULL,
    "sourceId" TEXT,
    "earnedAt" TIMESTAMP(3) NOT NULL,
    "approvedAt" TIMESTAMP(3),
    "approvedByUserId" TEXT,
    "paidAt" TIMESTAMP(3),
    "paidByUserId" TEXT,
    "paymentReference" TEXT,
    "paymentMethod" "PaymentMethod",
    "notes" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_commissions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "agent_commissions_policyId_sourceType_sourceId_key" ON "agent_commissions"("policyId", "sourceType", "sourceId");
CREATE INDEX IF NOT EXISTS "agent_commissions_agentId_idx" ON "agent_commissions"("agentId");
CREATE INDEX IF NOT EXISTS "agent_commissions_policyId_idx" ON "agent_commissions"("policyId");
CREATE INDEX IF NOT EXISTS "agent_commissions_status_idx" ON "agent_commissions"("status");

ALTER TABLE "agent_commissions" ADD CONSTRAINT "agent_commissions_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "agent_commissions" ADD CONSTRAINT "agent_commissions_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "agent_commissions" ADD CONSTRAINT "agent_commissions_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "policies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "agent_commissions" ADD CONSTRAINT "agent_commissions_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "agent_commissions" ADD CONSTRAINT "agent_commissions_commissionRuleId_fkey" FOREIGN KEY ("commissionRuleId") REFERENCES "agent_commission_rules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill lead agentId from assigned user's linked agent where possible
UPDATE "leads" l
SET "agentId" = a."id"
FROM "agents" a
WHERE l."agentId" IS NULL
  AND l."assignedToId" IS NOT NULL
  AND a."userId" = l."assignedToId"
  AND a."deletedAt" IS NULL;

-- Backfill client agentId from policies
UPDATE "clients" c
SET "agentId" = p."agentId"
FROM "policies" p
WHERE c."agentId" IS NULL
  AND p."clientId" = c."id"
  AND p."agentId" IS NOT NULL
  AND p."deletedAt" IS NULL;
