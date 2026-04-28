import { z } from 'zod';

const nullableString = z.string().trim().min(1).optional().nullable();
const dateString = z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/));

export const conversionMemberSchema = z.object({
  name: z.string().trim().min(1),
  relationship: z.string().trim().min(1),
  dateOfBirth: nullableString,
  gender: nullableString,
  idNumber: nullableString,
  effectiveDate: nullableString,
  premiumAmount: z.number().nonnegative().optional().nullable(),
});

export const completeLeadConversionSchema = z.object({
  clientType: z.enum(['INDIVIDUAL', 'CORPORATE', 'SME', 'GROUP', 'GOVERNMENT']).optional(),
  relationshipManagerId: z.string().uuid().optional().nullable(),
  client: z.object({
    firstName: nullableString,
    lastName: nullableString,
    companyName: nullableString,
    tradingName: nullableString,
    email: nullableString,
    phone: nullableString,
    kraPin: nullableString,
    nationalId: nullableString,
    passportNumber: nullableString,
    registrationNumber: nullableString,
    physicalAddress: nullableString,
    postalAddress: nullableString,
    county: nullableString,
    industry: nullableString,
    preferredChannel: nullableString,
    riskCategory: nullableString,
  }).optional().default({}),
  missingRecommendedFields: z.array(z.string()).optional().default([]),
  createMissingDetailsTask: z.boolean().optional().default(true),
  missingDetailsDueDate: dateString.optional(),
  startOnboardingNow: z.boolean().optional().default(false),
  createOnboardingTask: z.boolean().optional().default(true),
  onboardingDueDate: dateString.optional(),
  onboarding: z.object({
    productId: z.string().uuid().optional().nullable(),
    insurerId: z.string().uuid().optional().nullable(),
    premiumEstimate: z.number().nonnegative().optional().nullable(),
    riskDetails: z.record(z.any()).optional().nullable(),
    memberData: z.object({
      mode: z.enum(['NONE', 'MANUAL', 'ARCHIVE', 'BOTH']).optional().default('NONE'),
      archiveFileName: nullableString,
      members: z.array(conversionMemberSchema).optional().default([]),
      notes: nullableString,
    }).optional().nullable(),
  }).optional().nullable(),
});

export type CompleteLeadConversionInput = z.infer<typeof completeLeadConversionSchema>;
