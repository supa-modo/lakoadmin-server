/*
  Warnings:

  - Added the required column `insuranceClass` to the `products` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "InsuranceClass" AS ENUM ('MOTOR_PRIVATE', 'MOTOR_COMMERCIAL', 'MOTOR_CYCLE', 'MEDICAL_INPATIENT', 'MEDICAL_OUTPATIENT', 'MEDICAL_COMPREHENSIVE', 'LIFE_ORDINARY', 'GROUP_LIFE', 'CREDIT_LIFE', 'PENSION', 'FIRE_DOMESTIC', 'FIRE_INDUSTRIAL', 'ENGINEERING', 'MARINE_CARGO', 'MARINE_HULL', 'AVIATION', 'PERSONAL_ACCIDENT', 'TRAVEL', 'WORKMEN_COMPENSATION', 'EMPLOYER_LIABILITY', 'PUBLIC_LIABILITY', 'PROFESSIONAL_INDEMNITY', 'DIRECTORS_LIABILITY', 'BURGLARY', 'FIDELITY_GUARANTEE', 'MONEY', 'AGRICULTURE', 'MICRO_INSURANCE', 'OTHER');

-- AlterTable
ALTER TABLE "insurers" ADD COLUMN     "country" TEXT DEFAULT 'Kenya',
ADD COLUMN     "county" TEXT,
ADD COLUMN     "createdById" TEXT,
ADD COLUMN     "iraClassifications" "InsuranceClass"[],
ADD COLUMN     "logoUrl" TEXT;

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "benefits" JSONB,
ADD COLUMN     "brochureUrl" TEXT,
ADD COLUMN     "coverageDetails" JSONB,
ADD COLUMN     "createdById" TEXT,
ADD COLUMN     "insuranceClass" "InsuranceClass" NOT NULL,
ADD COLUMN     "maxSumInsured" DECIMAL(15,2),
ADD COLUMN     "minSumInsured" DECIMAL(15,2),
ADD COLUMN     "ratingFactors" JSONB,
ADD COLUMN     "requiredDocuments" TEXT[];

-- CreateIndex
CREATE INDEX "insurers_status_idx" ON "insurers"("status");

-- CreateIndex
CREATE INDEX "insurers_iraLicenseNumber_idx" ON "insurers"("iraLicenseNumber");

-- CreateIndex
CREATE INDEX "products_insuranceClass_idx" ON "products"("insuranceClass");
