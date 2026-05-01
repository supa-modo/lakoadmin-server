import { MessageStatus, Prisma } from '@prisma/client';
import { prisma } from '../../config/database';
import { addJob, QUEUE_NAMES } from '../../config/queues';
import { deliverMessage } from './delivery.service';
import { buildEntityVariables, mergeTemplate } from './templates.service';
import { ResolvedRecipient, resolveRecipients } from './messageRecipient.service';

const RETRYABLE_STATUSES = new Set<MessageStatus>([
  MessageStatus.FAILED,
  MessageStatus.PARTIALLY_FAILED,
  MessageStatus.BOUNCED,
]);

function isMarketingCategory(category: string) {
  return ['MARKETING', 'HOLIDAY_GREETING', 'BIRTHDAY_GREETING'].includes(category);
}

async function preferenceAllows(recipient: ResolvedRecipient, channel: string, category: string) {
  if (!isMarketingCategory(category)) return true;
  if (!recipient.clientId && !recipient.userId) return true;

  const preference = await prisma.communicationPreference.findFirst({
    where: {
      clientId: recipient.clientId ?? undefined,
      userId: recipient.userId ?? undefined,
      channel: channel as any,
      category: category as any,
    },
  });
  if (preference) return preference.isOptedIn;

  if (recipient.clientId) {
    const client = await prisma.client.findUnique({ where: { id: recipient.clientId } });
    if (!client) return false;
    if (channel === 'EMAIL') return client.emailOptIn && client.marketingOptIn;
    if (channel === 'SMS') return client.smsOptIn && client.marketingOptIn;
  }

  return true;
}

async function queueOrDeliver(messageLogId: string, scheduledAt?: Date | null) {
  if (scheduledAt && scheduledAt > new Date()) {
    const delay = scheduledAt.getTime() - Date.now();
    const queued = await addJob(QUEUE_NAMES.COMMUNICATIONS, 'deliver-message', { messageLogId }, { delay });
    if (queued) return;
  } else {
    const queued = await addJob(QUEUE_NAMES.COMMUNICATIONS, 'deliver-message', { messageLogId });
    if (queued) return;
  }

  await deliverMessage(messageLogId);
}

export async function createMessage(input: any, createdById?: string) {
  const entityVariables = await buildEntityVariables(input);
  let subject = input.subject ?? null;
  let body = input.body;
  let templateId = input.templateId ?? null;

  if (templateId) {
    const template = await prisma.messageTemplate.findUnique({ where: { id: templateId } });
    if (!template) throw new Error('Template not found');
    const variables = { ...(template.variables as Record<string, unknown> | null ?? {}), ...entityVariables, ...(input.variables ?? {}) };
    subject = mergeTemplate(template.subject, variables) ?? subject;
    body = mergeTemplate(template.body, variables) ?? body;
  } else {
    const variables = { ...entityVariables, ...(input.variables ?? {}) };
    subject = mergeTemplate(subject, variables);
    body = mergeTemplate(body, variables) ?? body;
  }

  const recipients = await resolveRecipients(input.recipients, input.channel);
  const allowedRecipients: ResolvedRecipient[] = [];
  const skippedRecipients: ResolvedRecipient[] = [];
  for (const recipient of recipients) {
    if (await preferenceAllows(recipient, input.channel, input.category)) allowedRecipients.push(recipient);
    else skippedRecipients.push(recipient);
  }

  if (allowedRecipients.length === 0) {
    throw new Error('No deliverable recipients after contact validation and opt-out checks');
  }

  const status = input.scheduledAt && input.scheduledAt > new Date()
    ? MessageStatus.SCHEDULED
    : MessageStatus.QUEUED;

  const message = await prisma.messageLog.create({
    data: {
      channel: input.channel,
      direction: 'OUTBOUND',
      messageType: input.messageType ?? 'MANUAL',
      subject,
      body,
      status,
      priority: input.priority ?? 'NORMAL',
      scheduledAt: input.scheduledAt ?? null,
      createdById,
      templateId,
      campaignId: input.campaignId ?? null,
      relatedEntityType: input.relatedEntityType ?? null,
      relatedEntityId: input.relatedEntityId ?? null,
      clientId: input.clientId ?? null,
      policyId: input.policyId ?? null,
      claimId: input.claimId ?? null,
      taskId: input.taskId ?? null,
      onboardingCaseId: input.onboardingCaseId ?? null,
      paymentId: input.paymentId ?? null,
      userId: input.userId ?? null,
      metadata: {
        variables: input.variables ?? {},
        skippedRecipients: skippedRecipients.map((recipient) => ({
          recipientType: recipient.recipientType,
          recipientName: recipient.recipientName ?? null,
          email: recipient.email ?? null,
          phone: recipient.phone ?? null,
          clientId: recipient.clientId ?? null,
          userId: recipient.userId ?? null,
          agentId: recipient.agentId ?? null,
          contactPersonId: recipient.contactPersonId ?? null,
        })),
      } as Prisma.InputJsonValue,
      recipients: {
        create: allowedRecipients.map((recipient) => ({
          recipientType: recipient.recipientType,
          recipientName: recipient.recipientName ?? null,
          email: recipient.email ?? null,
          phone: recipient.phone ?? null,
          clientId: recipient.clientId ?? null,
          userId: recipient.userId ?? null,
          agentId: recipient.agentId ?? null,
          contactPersonId: recipient.contactPersonId ?? null,
          status,
        })),
      },
    },
    include: { recipients: true },
  });

  if (input.sendNow !== false) {
    await queueOrDeliver(message.id, input.scheduledAt ?? null);
  }

  return prisma.messageLog.findUnique({
    where: { id: message.id },
    include: { recipients: true, template: true, campaign: true },
  });
}

export async function listMessageLogs(query: {
  page: number;
  limit: number;
  search?: string;
  channel?: string;
  status?: string;
  category?: string;
  entityType?: string;
  entityId?: string;
}) {
  const where: Prisma.MessageLogWhereInput = {};
  if (query.search) {
    where.OR = [
      { subject: { contains: query.search, mode: 'insensitive' } },
      { body: { contains: query.search, mode: 'insensitive' } },
      { recipients: { some: { recipientName: { contains: query.search, mode: 'insensitive' } } } },
      { recipients: { some: { email: { contains: query.search, mode: 'insensitive' } } } },
      { recipients: { some: { phone: { contains: query.search, mode: 'insensitive' } } } },
    ];
  }
  if (query.channel) where.channel = query.channel as any;
  if (query.status) where.status = query.status as any;
  if (query.category) where.template = { category: query.category as any };
  if (query.entityType && query.entityId) {
    where.relatedEntityType = query.entityType;
    where.relatedEntityId = query.entityId;
  }

  const skip = (query.page - 1) * query.limit;
  const [data, total] = await Promise.all([
    prisma.messageLog.findMany({
      where,
      include: {
        recipients: true,
        template: true,
        campaign: true,
        createdBy: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: query.limit,
    }),
    prisma.messageLog.count({ where }),
  ]);

  return { data, total };
}

export async function getMessageLog(id: string) {
  const message = await prisma.messageLog.findUnique({
    where: { id },
    include: {
      recipients: true,
      template: true,
      campaign: true,
      client: true,
      policy: true,
      claim: true,
      task: true,
      onboardingCase: true,
      payment: true,
      createdBy: { select: { id: true, firstName: true, lastName: true, email: true } },
    },
  });
  if (!message) throw new Error('Message not found');
  return message;
}

export async function retryMessage(id: string) {
  const message = await prisma.messageLog.findUnique({ where: { id } });
  if (!message) throw new Error('Message not found');
  if (!RETRYABLE_STATUSES.has(message.status)) {
    throw new Error('Only failed messages can be retried');
  }
  await prisma.messageRecipient.updateMany({
    where: { messageLogId: id, status: MessageStatus.FAILED },
    data: { status: MessageStatus.QUEUED, failedAt: null, failureReason: null },
  });
  await prisma.messageLog.update({ where: { id }, data: { status: MessageStatus.QUEUED, failedAt: null, failureReason: null } });
  await queueOrDeliver(id, null);
  return getMessageLog(id);
}

export async function communicationStats() {
  const [byStatus, byChannel, total] = await Promise.all([
    prisma.messageLog.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.messageLog.groupBy({ by: ['channel'], _count: { _all: true } }),
    prisma.messageLog.count(),
  ]);
  return { total, byStatus, byChannel };
}
