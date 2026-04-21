import { z } from 'zod';

export const createUserSchema = z.object({
  email: z.string().email(),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  phone: z.string().optional(),
  password: z
    .string()
    .min(8)
    .regex(/[A-Z]/)
    .regex(/[a-z]/)
    .regex(/\d/)
    .regex(/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/),
  roleIds: z.array(z.string().uuid()).optional(),
});

export const updateUserSchema = z.object({
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  phone: z.string().optional().nullable(),
  isActive: z.boolean().optional(),
});

export const assignRolesSchema = z.object({
  roleIds: z.array(z.string().uuid()).min(1, 'At least one role is required'),
});

export const listUsersSchema = z.object({
  page: z.string().optional(),
  limit: z.string().optional(),
  search: z.string().optional(),
  roleId: z.string().uuid().optional(),
  isActive: z.enum(['true', 'false']).optional(),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type AssignRolesInput = z.infer<typeof assignRolesSchema>;
