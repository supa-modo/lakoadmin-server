import { z } from 'zod';

export const createClientSchema = z.object({
  body: z.object({
    type: z.enum(['INDIVIDUAL', 'CORPORATE', 'SME', 'GROUP', 'GOVERNMENT']),
    
    // Individual fields
    firstName: z.string().min(1, 'First name is required').optional(),
    lastName: z.string().min(1, 'Last name is required').optional(),
    dateOfBirth: z.string().datetime().optional().nullable(),
    gender: z.string().optional().nullable(),
    nationalId: z.string().optional().nullable(),
    passportNumber: z.string().optional().nullable(),
    
    // Corporate fields
    companyName: z.string().optional().nullable(),
    registrationNumber: z.string().optional().nullable(),
    incorporationDate: z.string().datetime().optional().nullable(),
    tradingName: z.string().optional().nullable(),
    
    // Common fields
    kraPin: z.string().optional().nullable(),
    vatNumber: z.string().optional().nullable(),
    email: z.string().email('Invalid email').optional().nullable(),
    phone: z.string().optional().nullable(),
    alternatePhone: z.string().optional().nullable(),
    website: z.string().url('Invalid URL').optional().nullable(),
    
    // Address
    physicalAddress: z.string().optional().nullable(),
    postalAddress: z.string().optional().nullable(),
    county: z.string().optional().nullable(),
    country: z.string().default('Kenya'),
    
    // Business info
    industry: z.string().optional().nullable(),
    employeeCount: z.string().optional().nullable(),
    annualTurnover: z.string().optional().nullable(),
    
    // Relationship
    relationshipManagerId: z.string().uuid().optional().nullable(),
    
    // Communication preferences
    preferredChannel: z.string().optional().nullable(),
    preferredLanguage: z.string().default('en'),
    marketingOptIn: z.boolean().default(false),
    smsOptIn: z.boolean().default(true),
    emailOptIn: z.boolean().default(true),
    
    riskCategory: z.string().optional().nullable(),
  }).refine(
    (data) => {
      if (data.type === 'INDIVIDUAL') {
        return !!data.firstName && !!data.lastName;
      } else {
        return !!data.companyName;
      }
    },
    {
      message: 'Individual clients require firstName and lastName. Corporate clients require companyName.',
    }
  ),
});

export const updateClientSchema = z.object({
  body: z.object({
    type: z.enum(['INDIVIDUAL', 'CORPORATE', 'SME', 'GROUP', 'GOVERNMENT']).optional(),
    
    firstName: z.string().optional().nullable(),
    lastName: z.string().optional().nullable(),
    dateOfBirth: z.string().datetime().optional().nullable(),
    gender: z.string().optional().nullable(),
    nationalId: z.string().optional().nullable(),
    passportNumber: z.string().optional().nullable(),
    
    companyName: z.string().optional().nullable(),
    registrationNumber: z.string().optional().nullable(),
    incorporationDate: z.string().datetime().optional().nullable(),
    tradingName: z.string().optional().nullable(),
    
    kraPin: z.string().optional().nullable(),
    vatNumber: z.string().optional().nullable(),
    email: z.string().email('Invalid email').optional().nullable(),
    phone: z.string().optional().nullable(),
    alternatePhone: z.string().optional().nullable(),
    website: z.string().url('Invalid URL').optional().nullable(),
    
    physicalAddress: z.string().optional().nullable(),
    postalAddress: z.string().optional().nullable(),
    county: z.string().optional().nullable(),
    country: z.string().optional().nullable(),
    
    industry: z.string().optional().nullable(),
    employeeCount: z.string().optional().nullable(),
    annualTurnover: z.string().optional().nullable(),
    
    relationshipManagerId: z.string().uuid().optional().nullable(),
    
    preferredChannel: z.string().optional().nullable(),
    preferredLanguage: z.string().optional().nullable(),
    marketingOptIn: z.boolean().optional(),
    smsOptIn: z.boolean().optional(),
    emailOptIn: z.boolean().optional(),
    
    riskCategory: z.string().optional().nullable(),
  }),
});

export const listClientsSchema = z.object({
  page: z.string().transform(Number).default('1'),
  limit: z.string().transform(Number).default('20'),
  search: z.string().optional(),
  type: z.enum(['INDIVIDUAL', 'CORPORATE', 'SME', 'GROUP', 'GOVERNMENT']).optional(),
  relationshipManager: z.string().uuid().optional(),
});

export const createContactSchema = z.object({
  body: z.object({
    name: z.string().min(1, 'Name is required'),
    title: z.string().optional().nullable(),
    department: z.string().optional().nullable(),
    email: z.string().email('Invalid email').optional().nullable(),
    phone: z.string().optional().nullable(),
    role: z.string().optional().nullable(),
    isPrimary: z.boolean().default(false),
    canAuthorize: z.boolean().default(false),
    notes: z.string().optional().nullable(),
  }),
});

export const updateContactSchema = z.object({
  body: z.object({
    name: z.string().min(1, 'Name is required').optional(),
    title: z.string().optional().nullable(),
    department: z.string().optional().nullable(),
    email: z.string().email('Invalid email').optional().nullable(),
    phone: z.string().optional().nullable(),
    role: z.string().optional().nullable(),
    isPrimary: z.boolean().optional(),
    canAuthorize: z.boolean().optional(),
    notes: z.string().optional().nullable(),
  }),
});
