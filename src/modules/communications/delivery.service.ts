import { MessageChannel, MessageStatus } from '@prisma/client';
import { prisma } from '../../config/database';
import { sendEmail } from '../../services/emailService';
import { sendSms } from '../../services/smsService';
import { logger } from '../../utils/logger';

const SUCCESS_STATUSES = new Set<MessageStatus>([
  MessageStatus.SENT,
  MessageStatus.DELIVERED,
  MessageStatus.READ,
]);

function toHtml(body: string): string {
  if (/<[a-z][\s\S]*>/i.test(body)) return body;
  return body
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${paragraph.replace(/\n/g, '<br />')}</p>`)
    .join('');
}

async function markMessageFromRecipients(messageLogId: string) {
  const recipients = await prisma.messageRecipient.findMany({ where: { messageLogId } });
  const failed = recipients.filter((r) => r.status === MessageStatus.FAILED).length;
  const delivered = recipients.filter((r) => SUCCESS_STATUSES.has(r.status)).length;

  let status: MessageStatus = MessageStatus.SENT;
  if (failed === recipients.length) status = MessageStatus.FAILED;
  if (failed > 0 && delivered > 0) status = MessageStatus.PARTIALLY_FAILED;

  return prisma.messageLog.update({
    where: { id: messageLogId },
    data: {
      status,
      sentAt: delivered > 0 ? new Date() : undefined,
      failedAt: failed === recipients.length ? new Date() : undefined,
    },
  });
}

function buildEntityActionUrl(entityType?: string | null, entityId?: string | null) {
  if (!entityType || !entityId) return null;

  const routes: Record<string, string> = {
    CLIENT: `/admin/crm/clients/${entityId}`,
    POLICY: '/policies',
    CLAIM: `/claims/${entityId}`,
    TASK: '/admin/crm/tasks',
    ONBOARDING: '/admin/crm/onboarding',
    PAYMENT: '/payments',
    USER: '/admin/users',
  };

  return routes[entityType.toUpperCase()] ?? null;
}

export async function deliverMessage(messageLogId: string) {
  const message = await prisma.messageLog.findUnique({
    where: { id: messageLogId },
    include: { recipients: true },
  });
  if (!message) throw new Error('Message log not found');
  if (message.status === MessageStatus.CANCELLED) return message;

  await prisma.messageLog.update({
    where: { id: message.id },
    data: { status: MessageStatus.SENDING, attempts: { increment: 1 }, lastAttemptAt: new Date() },
  });

  if (message.channel === MessageChannel.INTERNAL_NOTIFICATION) {
    await Promise.all(message.recipients.map(async (recipient) => {
      if (!recipient.userId) return;
      await prisma.notification.create({
        data: {
          userId: recipient.userId,
          title: message.subject ?? message.messageType,
          message: message.body,
          type: message.messageType,
          relatedEntityType: message.relatedEntityType,
          relatedEntityId: message.relatedEntityId,
          actionUrl: buildEntityActionUrl(message.relatedEntityType, message.relatedEntityId),
        },
      });
      await prisma.messageRecipient.update({
        where: { id: recipient.id },
        data: { status: MessageStatus.DELIVERED, sentAt: new Date(), deliveredAt: new Date() },
      });
    }));
    return markMessageFromRecipients(message.id);
  }

  for (const recipient of message.recipients) {
    try {
      if (message.channel === MessageChannel.EMAIL) {
        if (!recipient.email) throw new Error('Recipient email is missing');
        const success = await sendEmail({
          to: recipient.email,
          subject: message.subject ?? 'Lako Insurance Agency',
          html: toHtml(message.body),
          text: message.body,
        });
        await prisma.messageRecipient.update({
          where: { id: recipient.id },
          data: {
            status: success ? MessageStatus.SENT : MessageStatus.FAILED,
            sentAt: success ? new Date() : undefined,
            failedAt: success ? undefined : new Date(),
            failureReason: success ? null : 'Email provider returned failure',
          },
        });
      } else if (message.channel === MessageChannel.SMS) {
        if (!recipient.phone) throw new Error('Recipient phone is missing');
        const result = await sendSms({ to: recipient.phone, message: message.body });
        await prisma.messageRecipient.update({
          where: { id: recipient.id },
          data: {
            status: result.success ? MessageStatus.SENT : MessageStatus.FAILED,
            sentAt: result.success ? new Date() : undefined,
            failedAt: result.success ? undefined : new Date(),
            failureReason: result.error,
            providerMessageId: result.providerMessageId,
            providerResponse: result.response as any,
          },
        });
      } else if (message.channel === MessageChannel.WHATSAPP) {
        throw new Error('WhatsApp provider is not configured yet');
      }
    } catch (error) {
      const failureReason = (error as Error).message;
      logger.error('Communication delivery failed', { messageLogId: message.id, recipientId: recipient.id, failureReason });
      await prisma.messageRecipient.update({
        where: { id: recipient.id },
        data: { status: MessageStatus.FAILED, failedAt: new Date(), failureReason },
      });
    }
  }

  const updated = await markMessageFromRecipients(message.id);
  if (message.campaignId) {
    const counts = await prisma.messageRecipient.groupBy({
      by: ['status'],
      where: { messageLog: { campaignId: message.campaignId } },
      _count: { _all: true },
    });
    const successfulCount = counts
      .filter((row) => SUCCESS_STATUSES.has(row.status))
      .reduce((sum, row) => sum + row._count._all, 0);
    const failedCount = counts
      .filter((row) => row.status === MessageStatus.FAILED)
      .reduce((sum, row) => sum + row._count._all, 0);
    await prisma.communicationCampaign.update({
      where: { id: message.campaignId },
      data: {
        successfulCount,
        failedCount,
        status: failedCount > 0 && successfulCount > 0
          ? 'PARTIALLY_FAILED'
          : failedCount > 0
            ? 'FAILED'
            : 'SENT',
        sentAt: new Date(),
      },
    });
  }
  return updated;
}
