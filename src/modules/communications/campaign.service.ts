import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database';
import { createMessage } from './communications.service';
import { previewAudience } from './messageRecipient.service';

export async function listCampaigns(query: { page: number; limit: number; search?: string; channel?: string; status?: string }) {
  const where: Prisma.CommunicationCampaignWhereInput = {};
  if (query.search) {
    where.OR = [
      { name: { contains: query.search, mode: 'insensitive' } },
      { description: { contains: query.search, mode: 'insensitive' } },
    ];
  }
  if (query.channel) where.channel = query.channel as any;
  if (query.status) where.status = query.status as any;

  const skip = (query.page - 1) * query.limit;
  const [data, total] = await Promise.all([
    prisma.communicationCampaign.findMany({
      where,
      include: {
        template: true,
        createdBy: { select: { id: true, firstName: true, lastName: true, email: true } },
        _count: { select: { messages: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: query.limit,
    }),
    prisma.communicationCampaign.count({ where }),
  ]);
  return { data, total };
}

export async function getCampaign(id: string) {
  const campaign = await prisma.communicationCampaign.findUnique({
    where: { id },
    include: { template: true, messages: { include: { recipients: true }, take: 50, orderBy: { createdAt: 'desc' } } },
  });
  if (!campaign) throw new Error('Campaign not found');
  return campaign;
}

export async function createCampaign(data: any, createdById?: string) {
  const audience = await previewAudience({
    audienceType: data.audienceType,
    channel: data.channel,
    filters: data.filters,
    customRecipients: data.customRecipients,
  });

  return prisma.communicationCampaign.create({
    data: {
      name: data.name,
      description: data.description,
      channel: data.channel,
      category: data.category,
      audienceType: data.audienceType,
      status: data.scheduledAt ? 'SCHEDULED' : data.status ?? 'DRAFT',
      templateId: data.templateId ?? null,
      subject: data.subject ?? null,
      body: data.body,
      filters: data.filters ?? {},
      scheduledAt: data.scheduledAt ?? null,
      createdById,
      totalRecipients: audience.total,
    },
  });
}

export async function updateCampaign(id: string, data: any) {
  await getCampaign(id);
  return prisma.communicationCampaign.update({ where: { id }, data });
}

export async function sendCampaign(id: string, createdById?: string) {
  const campaign = await getCampaign(id);
  if (campaign.status === 'CANCELLED') throw new Error('Cancelled campaigns cannot be sent');

  const audience = await previewAudience({
    audienceType: campaign.audienceType,
    channel: campaign.channel,
    filters: (campaign.filters as Record<string, unknown>) ?? {},
    limit: null,
  });

  if (audience.total === 0) throw new Error('Campaign has no deliverable recipients');

  await prisma.communicationCampaign.update({
    where: { id },
    data: { status: campaign.scheduledAt && campaign.scheduledAt > new Date() ? 'SCHEDULED' : 'SENDING', totalRecipients: audience.total },
  });

  const message = await createMessage({
    channel: campaign.channel,
    messageType: 'CAMPAIGN',
    category: campaign.category,
    subject: campaign.subject ?? undefined,
    body: campaign.body,
    templateId: campaign.templateId ?? undefined,
    recipients: audience.recipients,
    campaignId: campaign.id,
    scheduledAt: campaign.scheduledAt ?? undefined,
    sendNow: true,
  }, createdById);

  return { campaign: await getCampaign(id), message };
}

export async function cancelCampaign(id: string) {
  await getCampaign(id);
  await prisma.messageLog.updateMany({
    where: { campaignId: id, status: { in: ['QUEUED', 'SCHEDULED'] } },
    data: { status: 'CANCELLED' },
  });
  return prisma.communicationCampaign.update({
    where: { id },
    data: { status: 'CANCELLED' },
  });
}
