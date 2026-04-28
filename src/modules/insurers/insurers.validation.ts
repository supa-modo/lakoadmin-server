import { z } from 'zod';

export const createInsurerSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  shortName: z.string().optional(),
  registrationNumber: z.string().optional(),
  iraLicenseNumber: z.string().optional(),
  logoUrl: z.string().url().optional().or(z.literal('')),
  address: z.string().optional(),
  county: z.string().optional(),
  country: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email('Invalid email').optional().or(z.literal('')),
  website: z.string().url('Invalid URL').optional().or(z.literal('')),
  bankName: z.string().optional(),
  bankBranch: z.string().optional(),
  bankAccountName: z.string().optional(),
  bankAccountNumber: z.string().optional(),
  bankSwiftCode: z.string().optional(),
  iraClassifications: z.array(z.string()).optional(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'SUSPENDED']).optional(),
  notes: z.string().optional(),
});

export const updateInsurerSchema = createInsurerSchema.partial();

export const createContactSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  title: z.string().optional(),
  department: z.string().optional(),
  email: z.string().email('Invalid email').optional().or(z.literal('')),
  phone: z.string().optional(),
  isPrimary: z.boolean().optional(),
  notes: z.string().optional(),
});

export const updateContactSchema = createContactSchema.partial();

export type CreateInsurerInput = z.infer<typeof createInsurerSchema>;
export type UpdateInsurerInput = z.infer<typeof updateInsurerSchema>;
export type CreateContactInput = z.infer<typeof createContactSchema>;
export type UpdateContactInput = z.infer<typeof updateContactSchema>;
