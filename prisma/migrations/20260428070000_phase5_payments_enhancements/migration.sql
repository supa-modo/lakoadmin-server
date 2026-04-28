-- Phase 5 Payments and Receipts enhancements

ALTER TYPE "PaymentStatus" ADD VALUE IF NOT EXISTS 'COMPLETED';
ALTER TYPE "PaymentStatus" ADD VALUE IF NOT EXISTS 'FAILED';

ALTER TABLE "payments"
  ADD COLUMN IF NOT EXISTS "failureReason" TEXT,
  ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);

ALTER TABLE "payment_allocations"
  ADD COLUMN IF NOT EXISTS "reversedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "reversedById" TEXT,
  ADD COLUMN IF NOT EXISTS "reversalReason" TEXT,
  ADD COLUMN IF NOT EXISTS "createdById" TEXT;

ALTER TABLE "receipts"
  ADD COLUMN IF NOT EXISTS "fileUrl" TEXT,
  ADD COLUMN IF NOT EXISTS "fileSize" INTEGER,
  ADD COLUMN IF NOT EXISTS "mimeType" TEXT,
  ADD COLUMN IF NOT EXISTS "documentId" TEXT,
  ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);

ALTER TABLE "invoices"
  ADD COLUMN IF NOT EXISTS "insurerId" TEXT,
  ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);

ALTER TABLE "bank_accounts"
  ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);

ALTER TABLE "mpesa_accounts"
  ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "mpesa_transactions" (
  "id" TEXT NOT NULL,
  "paymentId" TEXT,
  "mpesaAccountId" TEXT,
  "merchantRequestId" TEXT,
  "checkoutRequestId" TEXT,
  "conversationId" TEXT,
  "originatorConversationId" TEXT,
  "transactionCode" TEXT NOT NULL,
  "phoneNumber" TEXT,
  "accountReference" TEXT,
  "transactionDate" TIMESTAMP(3) NOT NULL,
  "amount" DECIMAL(15,2) NOT NULL,
  "resultCode" TEXT,
  "resultDescription" TEXT,
  "rawPayload" JSONB,
  "matchedAt" TIMESTAMP(3),
  "matchedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "mpesa_transactions_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'mpesa_transactions_paymentId_fkey'
  ) THEN
    ALTER TABLE "mpesa_transactions"
      ADD CONSTRAINT "mpesa_transactions_paymentId_fkey"
      FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'mpesa_transactions_mpesaAccountId_fkey'
  ) THEN
    ALTER TABLE "mpesa_transactions"
      ADD CONSTRAINT "mpesa_transactions_mpesaAccountId_fkey"
      FOREIGN KEY ("mpesaAccountId") REFERENCES "mpesa_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'invoices_insurerId_fkey'
  ) THEN
    ALTER TABLE "invoices"
      ADD CONSTRAINT "invoices_insurerId_fkey"
      FOREIGN KEY ("insurerId") REFERENCES "insurers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "mpesa_transactions_transactionCode_key" ON "mpesa_transactions"("transactionCode");
CREATE INDEX IF NOT EXISTS "mpesa_transactions_paymentId_idx" ON "mpesa_transactions"("paymentId");
CREATE INDEX IF NOT EXISTS "mpesa_transactions_mpesaAccountId_idx" ON "mpesa_transactions"("mpesaAccountId");
CREATE INDEX IF NOT EXISTS "mpesa_transactions_transactionDate_idx" ON "mpesa_transactions"("transactionDate");
CREATE INDEX IF NOT EXISTS "mpesa_transactions_phoneNumber_idx" ON "mpesa_transactions"("phoneNumber");
CREATE INDEX IF NOT EXISTS "invoices_insurerId_idx" ON "invoices"("insurerId");
