import { prisma } from '../../config/database';
import { createMessage } from './communications.service';

export async function listAutomationRules() {
  return prisma.automationRule.findMany({
    include: { template: true, createdBy: { select: { id: true, firstName: true, lastName: true, email: true } } },
    orderBy: [{ isActive: 'desc' }, { triggerType: 'asc' }],
  });
}

export async function updateAutomationRule(id: string, data: any, userId?: string) {
  const existing = await prisma.automationRule.findUnique({ where: { id } });
  if (!existing) throw new Error('Automation rule not found');
  return prisma.automationRule.update({
    where: { id },
    data: {
      ...data,
      createdById: existing.createdById ?? userId,
    },
    include: { template: true },
  });
}

export async function testAutomationRule(id: string, userId?: string) {
  const rule = await prisma.automationRule.findUnique({ where: { id }, include: { template: true } });
  if (!rule) throw new Error('Automation rule not found');
  if (!userId) throw new Error('Authenticated user is required');

  return createMessage({
    channel: 'INTERNAL_NOTIFICATION',
    messageType: 'AUTOMATION_TEST',
    category: 'SYSTEM',
    subject: `Automation test: ${rule.name}`,
    body: `Test notification for automation rule ${rule.name}.`,
    recipients: [{ recipientType: 'USER', userId }],
    relatedEntityType: 'AutomationRule',
    relatedEntityId: id,
  }, userId);
}
