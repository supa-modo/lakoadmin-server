import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database';
import { createMessage } from '../communications/communications.service';

const CADENCES = [30, 14, 7] as const;

function startOfDay(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function addDays(date: Date, days: number): Date {
  const copy = startOfDay(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function clientDisplayName(client: { firstName?: string | null; lastName?: string | null; companyName?: string | null; tradingName?: string | null }) {
  const person = `${client.firstName ?? ''} ${client.lastName ?? ''}`.trim();
  return person || client.companyName || client.tradingName || 'Client';
}

export async function runRenewalReminderScan(anchorDate = new Date(), userId?: string) {
  const summary = {
    scanned: 0,
    created: 0,
    skipped: 0,
    failed: 0,
    cadences: {} as Record<number, { scanned: number; created: number; skipped: number; failed: number }>,
  };

  for (const cadenceDays of CADENCES) {
    summary.cadences[cadenceDays] = { scanned: 0, created: 0, skipped: 0, failed: 0 };
    const reminderDate = startOfDay(anchorDate);
    const start = addDays(anchorDate, cadenceDays);
    const end = addDays(anchorDate, cadenceDays + 1);

    const policies = await prisma.policy.findMany({
      where: {
        deletedAt: null,
        status: 'ACTIVE',
        endDate: { gte: start, lt: end },
      },
      include: {
        client: true,
        insurer: { select: { id: true, name: true, shortName: true } },
        product: { select: { id: true, name: true } },
      },
    });

    summary.scanned += policies.length;
    summary.cadences[cadenceDays].scanned += policies.length;

    for (const policy of policies) {
      const channel = policy.client.email ? 'EMAIL' : policy.client.phone ? 'SMS' : 'IN_APP';
      try {
        const existing = await prisma.renewalReminderLog.findUnique({
          where: {
            policyId_cadenceDays_reminderDate_channel: {
              policyId: policy.id,
              cadenceDays,
              reminderDate,
              channel,
            },
          },
        });
        if (existing) {
          summary.skipped += 1;
          summary.cadences[cadenceDays].skipped += 1;
          continue;
        }

        const log = await prisma.renewalReminderLog.create({
          data: {
            policyId: policy.id,
            clientId: policy.clientId,
            cadenceDays,
            reminderDate,
            channel,
            status: channel === 'IN_APP' ? 'SKIPPED' : 'CREATED',
            metadata: {
              policyNumber: policy.policyNumber,
              endDate: policy.endDate.toISOString(),
              reason: channel === 'IN_APP' ? 'Client missing email and phone' : undefined,
            } as Prisma.InputJsonValue,
          },
        });

        let messageLogId: string | null = null;
        if (channel !== 'IN_APP') {
          const name = clientDisplayName(policy.client);
          const body = channel === 'EMAIL'
            ? `Dear ${name},\n\nYour ${policy.product.name} policy ${policy.policyNumber} with ${policy.insurer.name} expires in ${cadenceDays} days. Please contact Lako Agency to review renewal terms and avoid a cover gap.\n\nRegards,\nLako Insurance Agency`
            : `Policy ${policy.policyNumber} expires in ${cadenceDays} days. Please contact Lako Agency for renewal support.`;
          const message = await createMessage({
            channel,
            messageType: 'WORKFLOW_AUTOMATION',
            category: 'POLICY_RENEWAL_REMINDER',
            subject: channel === 'EMAIL' ? `Renewal reminder: ${policy.policyNumber}` : null,
            body,
            recipients: [{ recipientType: 'CLIENT', clientId: policy.clientId }],
            clientId: policy.clientId,
            policyId: policy.id,
            relatedEntityType: 'Policy',
            relatedEntityId: policy.id,
            variables: { policyNumber: policy.policyNumber, cadenceDays, productName: policy.product.name, insurerName: policy.insurer.name },
          }, userId);
          messageLogId = message?.id ?? null;
        }

        const task = await prisma.task.create({
          data: {
            title: `Renew policy ${policy.policyNumber} (${cadenceDays} days)`,
            description: `Follow up renewal terms and client decision before ${policy.endDate.toISOString().slice(0, 10)}.`,
            category: 'POLICY_RENEWAL',
            dueDate: addDays(anchorDate, Math.max(1, cadenceDays - 3)),
            priority: cadenceDays <= 7 ? 'HIGH' : 'NORMAL',
            clientId: policy.clientId,
            policyId: policy.id,
            insurerId: policy.insurerId,
            assignedToId: policy.createdById ?? userId ?? null,
            createdById: userId ?? null,
          },
        });

        await prisma.policyEvent.create({
          data: {
            policyId: policy.id,
            eventType: 'RENEWAL_REMINDER_SENT',
            description: `${cadenceDays}-day renewal reminder ${messageLogId ? 'queued' : 'logged'}`,
            userId: userId ?? null,
            metadata: { cadenceDays, renewalReminderLogId: log.id, messageLogId, taskId: task.id },
          },
        });

        await prisma.renewalReminderLog.update({
          where: { id: log.id },
          data: { status: messageLogId ? 'QUEUED' : 'SKIPPED', messageLogId, taskId: task.id },
        });
        summary.created += 1;
        summary.cadences[cadenceDays].created += 1;
      } catch (error) {
        summary.failed += 1;
        summary.cadences[cadenceDays].failed += 1;
      }
    }
  }

  return summary;
}
