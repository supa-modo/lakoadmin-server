-- Add guided workflow traceability across leads, onboarding, policies, and tasks.
ALTER TABLE "onboarding_cases"
  ADD COLUMN "leadId" TEXT,
  ADD COLUMN "productId" TEXT,
  ADD COLUMN "insurerId" TEXT,
  ADD COLUMN "premiumEstimate" DECIMAL(15,2),
  ADD COLUMN "riskDetails" JSONB,
  ADD COLUMN "memberData" JSONB;

ALTER TABLE "tasks"
  ADD COLUMN "onboardingCaseId" TEXT;

ALTER TABLE "policies"
  ADD COLUMN "onboardingCaseId" TEXT,
  ADD COLUMN "sourceLeadId" TEXT;

CREATE INDEX "onboarding_cases_leadId_idx" ON "onboarding_cases"("leadId");
CREATE INDEX "onboarding_cases_productId_idx" ON "onboarding_cases"("productId");
CREATE INDEX "onboarding_cases_insurerId_idx" ON "onboarding_cases"("insurerId");
CREATE INDEX "tasks_onboardingCaseId_idx" ON "tasks"("onboardingCaseId");
CREATE INDEX "policies_onboardingCaseId_idx" ON "policies"("onboardingCaseId");
CREATE INDEX "policies_sourceLeadId_idx" ON "policies"("sourceLeadId");

ALTER TABLE "onboarding_cases"
  ADD CONSTRAINT "onboarding_cases_leadId_fkey"
  FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "onboarding_cases"
  ADD CONSTRAINT "onboarding_cases_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "onboarding_cases"
  ADD CONSTRAINT "onboarding_cases_insurerId_fkey"
  FOREIGN KEY ("insurerId") REFERENCES "insurers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "tasks"
  ADD CONSTRAINT "tasks_onboardingCaseId_fkey"
  FOREIGN KEY ("onboardingCaseId") REFERENCES "onboarding_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "policies"
  ADD CONSTRAINT "policies_onboardingCaseId_fkey"
  FOREIGN KEY ("onboardingCaseId") REFERENCES "onboarding_cases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "policies"
  ADD CONSTRAINT "policies_sourceLeadId_fkey"
  FOREIGN KEY ("sourceLeadId") REFERENCES "leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;
