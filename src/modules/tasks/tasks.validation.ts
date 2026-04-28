import { z } from 'zod';

export const createTaskSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  description: z.string().optional().nullable(),
  category: z.string().optional().nullable(),
  dueDate: z.string().datetime().optional().nullable(),
  priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']).default('NORMAL'),

  // Entity links
  leadId: z.string().uuid().optional().nullable(),
  clientId: z.string().uuid().optional().nullable(),
  policyId: z.string().uuid().optional().nullable(),
  claimId: z.string().uuid().optional().nullable(),

  assignedToId: z.string().uuid().optional().nullable(),

  isRecurring: z.boolean().default(false),
  recurrenceRule: z.string().optional().nullable(),
});

export const updateTaskSchema = z.object({
  title: z.string().min(1, 'Title is required').optional(),
  description: z.string().optional().nullable(),
  category: z.string().optional().nullable(),
  dueDate: z.string().datetime().optional().nullable(),
  priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']).optional(),
  status: z.enum(['PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']).optional(),
  assignedToId: z.string().uuid().optional().nullable(),

  isRecurring: z.boolean().optional(),
  recurrenceRule: z.string().optional().nullable(),
});

export const listTasksSchema = z.object({
  page: z.string().transform(Number).default('1'),
  limit: z.string().transform(Number).default('20'),
  search: z.string().optional(),
  status: z.enum(['PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']).optional(),
  priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']).optional(),
  assignedTo: z.string().uuid().optional(),
  entityType: z.enum(['lead', 'client', 'policy', 'claim']).optional(),
  entityId: z.string().uuid().optional(),
  overdue: z.enum(['true', 'false']).optional(),
});

export const createTaskActivitySchema = z.object({
  type: z.string().min(1, 'Activity type is required').default('COMMENT'),
  description: z.string().min(1, 'Description is required'),
  metadata: z.record(z.any()).optional().nullable(),
});
