import { z } from 'zod';

const InsuranceClassEnum = z.enum([
  'MOTOR_PRIVATE', 'MOTOR_COMMERCIAL', 'MOTOR_CYCLE',
  'MEDICAL_INPATIENT', 'MEDICAL_OUTPATIENT', 'MEDICAL_COMPREHENSIVE',
  'LIFE_ORDINARY', 'GROUP_LIFE', 'CREDIT_LIFE', 'PENSION',
  'FIRE_DOMESTIC', 'FIRE_INDUSTRIAL', 'ENGINEERING',
  'MARINE_CARGO', 'MARINE_HULL', 'AVIATION',
  'PERSONAL_ACCIDENT', 'TRAVEL',
  'WORKMEN_COMPENSATION', 'EMPLOYER_LIABILITY', 'PUBLIC_LIABILITY',
  'PROFESSIONAL_INDEMNITY', 'DIRECTORS_LIABILITY',
  'BURGLARY', 'FIDELITY_GUARANTEE', 'MONEY',
  'AGRICULTURE', 'MICRO_INSURANCE', 'OTHER',
]);

const ClientTypeEnum = z.enum(['INDIVIDUAL', 'CORPORATE', 'SME', 'GROUP', 'GOVERNMENT']);
const PaymentFrequencyEnum = z.enum(['ANNUAL', 'SEMI_ANNUAL', 'QUARTERLY', 'MONTHLY']);
const ProductStatusEnum = z.enum(['ACTIVE', 'INACTIVE', 'DISCONTINUED']);

export const createProductSchema = z.object({
  insurerId: z.string().uuid('Invalid insurer ID'),
  code: z.string().min(2, 'Product code must be at least 2 characters'),
  name: z.string().min(2, 'Name must be at least 2 characters'),
  insuranceClass: InsuranceClassEnum,
  category: z.string().min(1, 'Category is required'),
  subcategory: z.string().optional(),
  description: z.string().optional(),
  eligibleClientTypes: z.array(ClientTypeEnum).optional(),
  minPremium: z.number().positive().optional().nullable(),
  maxPremium: z.number().positive().optional().nullable(),
  minSumInsured: z.number().positive().optional().nullable(),
  maxSumInsured: z.number().positive().optional().nullable(),
  policyDurations: z.array(z.string()).optional(),
  paymentOptions: z.array(PaymentFrequencyEnum).optional(),
  coverageDetails: z.record(z.any()).optional().nullable(),
  ratingFactors: z.record(z.any()).optional().nullable(),
  benefits: z.record(z.any()).optional().nullable(),
  requiredDocuments: z.array(z.string()).optional(),
  brochureUrl: z.string().url().optional().nullable().or(z.literal('')),
  status: ProductStatusEnum.optional(),
});

export const updateProductSchema = createProductSchema.partial().omit({ insurerId: true, code: true });

export const createVersionSchema = z.object({
  versionNumber: z.string().min(1, 'Version number is required'),
  effectiveDate: z.string().datetime(),
  terms: z.string().optional(),
  exclusions: z.string().optional(),
  claimsProcess: z.string().optional(),
  documentUrl: z.string().url().optional().nullable().or(z.literal('')),
  isActive: z.boolean().optional(),
});

export const updateVersionSchema = createVersionSchema.partial();

export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
export type CreateVersionInput = z.infer<typeof createVersionSchema>;
export type UpdateVersionInput = z.infer<typeof updateVersionSchema>;
