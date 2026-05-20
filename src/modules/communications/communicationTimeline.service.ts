import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database';

export async function listEntityCommunications(entityType: string, entityId: string) {
  const normalizedEntityType = entityType.toLowerCase();
  const where: Prisma.MessageLogWhereInput = {
    OR: [
      { relatedEntityType: entityType, relatedEntityId: entityId },
      { relatedEntityType: normalizedEntityType, relatedEntityId: entityId },
    ],
  };

  switch (normalizedEntityType) {
    case 'client':
      where.OR?.push({ clientId: entityId });
      break;
    case 'policy':
      where.OR?.push({ policyId: entityId });
      break;
    case 'claim':
      where.OR?.push({ claimId: entityId });
      break;
    case 'task':
      where.OR?.push({ taskId: entityId });
      break;
    case 'lead':
      break;
    case 'onboarding':
    case 'onboardingcase':
      where.OR?.push({ onboardingCaseId: entityId });
      break;
    case 'payment':
      where.OR?.push({ paymentId: entityId });
      break;
    case 'user':
      where.OR?.push({ userId: entityId });
      break;
  }

  return prisma.messageLog.findMany({
    where,
    include: {
      recipients: true,
      template: true,
      campaign: true,
      createdBy: { select: { id: true, firstName: true, lastName: true, email: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
}
