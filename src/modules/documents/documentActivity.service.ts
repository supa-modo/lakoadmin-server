import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database';

export async function recordDocumentActivity(
  documentId: string,
  action: string,
  performedById?: string,
  notes?: string | null,
  metadata?: Record<string, unknown>,
) {
  return prisma.documentActivity.create({
    data: {
      documentId,
      action,
      performedById: performedById ?? null,
      notes: notes ?? null,
      metadata: (metadata ?? undefined) as Prisma.InputJsonValue | undefined,
    },
  });
}
