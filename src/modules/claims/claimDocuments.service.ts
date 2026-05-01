import { InsuranceClass, Prisma } from '@prisma/client';
import { prisma } from '../../config/database';

const DEFAULT_REQUIREMENTS: Array<{
  insuranceClass?: InsuranceClass;
  claimType: string;
  lossType: string;
  documentType: string;
  documentName: string;
  description: string;
  sortOrder: number;
}> = [
  { insuranceClass: 'MOTOR_PRIVATE', claimType: 'MOTOR_ACCIDENT', lossType: 'ACCIDENT', documentType: 'CLAIM_FORM', documentName: 'Claim form', description: 'Completed motor accident claim form.', sortOrder: 1 },
  { insuranceClass: 'MOTOR_PRIVATE', claimType: 'MOTOR_ACCIDENT', lossType: 'ACCIDENT', documentType: 'POLICE_ABSTRACT', documentName: 'Police abstract', description: 'Police abstract or OB number for the accident.', sortOrder: 2 },
  { insuranceClass: 'MOTOR_PRIVATE', claimType: 'MOTOR_ACCIDENT', lossType: 'ACCIDENT', documentType: 'DRIVING_LICENSE', documentName: 'Driving license', description: 'Driver license copy for the driver at loss time.', sortOrder: 3 },
  { insuranceClass: 'MOTOR_PRIVATE', claimType: 'MOTOR_ACCIDENT', lossType: 'ACCIDENT', documentType: 'PHOTOS', documentName: 'Accident photos', description: 'Photos showing vehicle damage and accident scene.', sortOrder: 4 },
  { insuranceClass: 'MOTOR_PRIVATE', claimType: 'MOTOR_ACCIDENT', lossType: 'ACCIDENT', documentType: 'REPAIR_ESTIMATE', documentName: 'Repair estimate', description: 'Garage assessment or repair estimate.', sortOrder: 5 },
  { insuranceClass: 'MOTOR_PRIVATE', claimType: 'MOTOR_THEFT', lossType: 'THEFT', documentType: 'CLAIM_FORM', documentName: 'Claim form', description: 'Completed motor theft claim form.', sortOrder: 1 },
  { insuranceClass: 'MOTOR_PRIVATE', claimType: 'MOTOR_THEFT', lossType: 'THEFT', documentType: 'POLICE_REPORT', documentName: 'Police report', description: 'Police report for theft incident.', sortOrder: 2 },
  { insuranceClass: 'MOTOR_PRIVATE', claimType: 'MOTOR_THEFT', lossType: 'THEFT', documentType: 'LOGBOOK', documentName: 'Vehicle logbook', description: 'Vehicle ownership/logbook copy.', sortOrder: 3 },
  { insuranceClass: 'MOTOR_PRIVATE', claimType: 'MOTOR_THEFT', lossType: 'THEFT', documentType: 'KEYS_CONFIRMATION', documentName: 'Keys confirmation', description: 'Confirmation of original and spare keys.', sortOrder: 4 },
  { insuranceClass: 'FIRE_DOMESTIC', claimType: 'PROPERTY_FIRE', lossType: 'FIRE', documentType: 'CLAIM_FORM', documentName: 'Claim form', description: 'Completed property claim form.', sortOrder: 1 },
  { insuranceClass: 'FIRE_DOMESTIC', claimType: 'PROPERTY_FIRE', lossType: 'FIRE', documentType: 'FIRE_BRIGADE_REPORT', documentName: 'Fire brigade report', description: 'Fire brigade report where applicable.', sortOrder: 2 },
  { insuranceClass: 'FIRE_DOMESTIC', claimType: 'PROPERTY_FIRE', lossType: 'FIRE', documentType: 'PHOTOS', documentName: 'Loss photos', description: 'Photos of damaged property.', sortOrder: 3 },
  { insuranceClass: 'FIRE_DOMESTIC', claimType: 'PROPERTY_FIRE', lossType: 'FIRE', documentType: 'REPLACEMENT_ESTIMATE', documentName: 'Repair/replacement estimates', description: 'Repair or replacement quotations.', sortOrder: 4 },
  { insuranceClass: 'MEDICAL_COMPREHENSIVE', claimType: 'MEDICAL', lossType: 'ILLNESS', documentType: 'CLAIM_FORM', documentName: 'Claim form', description: 'Completed medical claim form.', sortOrder: 1 },
  { insuranceClass: 'MEDICAL_COMPREHENSIVE', claimType: 'MEDICAL', lossType: 'ILLNESS', documentType: 'MEDICAL_REPORT', documentName: 'Medical report', description: 'Doctor or hospital medical report.', sortOrder: 2 },
  { insuranceClass: 'MEDICAL_COMPREHENSIVE', claimType: 'MEDICAL', lossType: 'ILLNESS', documentType: 'INVOICES', documentName: 'Hospital invoices', description: 'Hospital/clinic invoices.', sortOrder: 3 },
  { insuranceClass: 'MEDICAL_COMPREHENSIVE', claimType: 'MEDICAL', lossType: 'ILLNESS', documentType: 'RECEIPTS', documentName: 'Receipts', description: 'Payment receipts for reimbursement.', sortOrder: 4 },
  { insuranceClass: 'LIFE_ORDINARY', claimType: 'LIFE_DEATH', lossType: 'DEATH', documentType: 'CLAIM_FORM', documentName: 'Claim form', description: 'Completed life/death claim form.', sortOrder: 1 },
  { insuranceClass: 'LIFE_ORDINARY', claimType: 'LIFE_DEATH', lossType: 'DEATH', documentType: 'DEATH_CERTIFICATE', documentName: 'Death certificate', description: 'Official death certificate.', sortOrder: 2 },
  { insuranceClass: 'LIFE_ORDINARY', claimType: 'LIFE_DEATH', lossType: 'DEATH', documentType: 'BURIAL_PERMIT', documentName: 'Burial permit', description: 'Burial permit where required.', sortOrder: 3 },
  { insuranceClass: 'LIFE_ORDINARY', claimType: 'LIFE_DEATH', lossType: 'DEATH', documentType: 'BENEFICIARY_ID', documentName: 'Beneficiary ID', description: 'Beneficiary identification document.', sortOrder: 4 },
  { claimType: 'GENERAL', lossType: 'OTHER', documentType: 'CLAIM_FORM', documentName: 'Claim form', description: 'Completed insurer claim form.', sortOrder: 1 },
  { claimType: 'GENERAL', lossType: 'OTHER', documentType: 'SUPPORTING_EVIDENCE', documentName: 'Supporting evidence', description: 'Documents supporting the claim event and amount.', sortOrder: 2 },
];

export function defaultClaimRequirements() {
  return DEFAULT_REQUIREMENTS;
}

export async function getDocumentChecklist(claimId: string) {
  const claim = await prisma.claim.findUnique({
    where: { id: claimId },
    include: {
      product: { select: { id: true, insuranceClass: true, category: true } },
      documents: true,
    },
  });
  if (!claim) throw new Error('Claim not found');

  const requirements = await prisma.claimDocumentRequirement.findMany({
    where: {
      isActive: true,
      OR: [
        { productId: claim.productId },
        { insuranceClass: claim.product.insuranceClass },
        { lossType: { equals: claim.lossType, mode: 'insensitive' } },
        { claimType: 'GENERAL' },
      ],
    },
    orderBy: [{ sortOrder: 'asc' }, { documentName: 'asc' }],
  });

  const unique = new Map<string, (typeof requirements)[number]>();
  for (const requirement of requirements) {
    const key = `${requirement.documentType}:${requirement.documentName}`;
    if (!unique.has(key)) unique.set(key, requirement);
  }

  return Array.from(unique.values()).map((requirement) => {
    const matchingDocs = claim.documents.filter((doc) =>
      doc.requirementId === requirement.id || doc.type === requirement.documentType,
    );
    const verified = matchingDocs.some((doc) => doc.status === 'VERIFIED');
    return {
      ...requirement,
      documents: matchingDocs,
      satisfied: !requirement.isRequired || verified,
    };
  });
}

export async function seedDefaultClaimRequirements() {
  for (const item of DEFAULT_REQUIREMENTS) {
    await prisma.claimDocumentRequirement.upsert({
      where: {
        id: `seed-${item.claimType}-${item.documentType}`.toLowerCase().replace(/[^a-z0-9-]/g, '-'),
      },
      update: {
        description: item.description,
        sortOrder: item.sortOrder,
        isActive: true,
      },
      create: {
        id: `seed-${item.claimType}-${item.documentType}`.toLowerCase().replace(/[^a-z0-9-]/g, '-'),
        ...item,
      } as Prisma.ClaimDocumentRequirementCreateInput,
    });
  }
}
