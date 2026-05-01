import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database';

export function extractTemplateVariables(text: string): string[] {
  const matches = text.match(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g) ?? [];
  return Array.from(new Set(matches.map((item) => item.replace(/[{}]/g, '').trim())));
}

export function mergeTemplate(text: string | null | undefined, variables: Record<string, unknown>): string | null {
  if (!text) return text ?? null;
  return text.replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (_, key) => {
    let value: unknown = variables;
    for (const part of String(key).split('.')) {
      if (value && typeof value === 'object' && part in value) {
        value = (value as Record<string, unknown>)[part];
      } else {
        value = undefined;
        break;
      }
    }
    return value === undefined || value === null ? '' : String(value);
  });
}

export async function listTemplates(query: {
  page: number;
  limit: number;
  search?: string;
  channel?: string;
  category?: string;
}) {
  const where: Prisma.MessageTemplateWhereInput = {};
  if (query.search) {
    where.OR = [
      { name: { contains: query.search, mode: 'insensitive' } },
      { code: { contains: query.search, mode: 'insensitive' } },
      { body: { contains: query.search, mode: 'insensitive' } },
    ];
  }
  if (query.channel) where.channel = query.channel as any;
  if (query.category) where.category = query.category as any;

  const skip = (query.page - 1) * query.limit;
  const [data, total] = await Promise.all([
    prisma.messageTemplate.findMany({
      where,
      skip,
      take: query.limit,
      orderBy: [{ isSystem: 'desc' }, { updatedAt: 'desc' }],
      include: {
        createdBy: { select: { id: true, firstName: true, lastName: true, email: true } },
        updatedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    }),
    prisma.messageTemplate.count({ where }),
  ]);

  return { data, total };
}

export async function getTemplate(id: string) {
  const template = await prisma.messageTemplate.findUnique({ where: { id } });
  if (!template) throw new Error('Template not found');
  return template;
}

export async function createTemplate(data: any, userId?: string) {
  const variables = data.variables ?? Object.fromEntries(
    extractTemplateVariables(`${data.subject ?? ''} ${data.body}`).map((key) => [key, '']),
  );

  return prisma.messageTemplate.create({
    data: {
      name: data.name,
      code: data.code,
      channel: data.channel,
      category: data.category,
      subject: data.subject ?? null,
      body: data.body,
      variables,
      isSystem: data.isSystem ?? false,
      isActive: data.isActive ?? true,
      createdById: userId,
      updatedById: userId,
    },
  });
}

export async function updateTemplate(id: string, data: any, userId?: string) {
  await getTemplate(id);
  return prisma.messageTemplate.update({
    where: { id },
    data: {
      ...data,
      updatedById: userId,
    },
  });
}

export async function archiveTemplate(id: string, userId?: string) {
  await getTemplate(id);
  return prisma.messageTemplate.update({
    where: { id },
    data: { isActive: false, updatedById: userId },
  });
}

export async function buildEntityVariables(entity?: {
  clientId?: string;
  policyId?: string;
  claimId?: string;
  taskId?: string;
  onboardingCaseId?: string;
  paymentId?: string;
  userId?: string;
}) {
  const variables: Record<string, unknown> = {
    companyName: 'Lako Insurance Agency',
  };

  if (entity?.clientId) {
    const client = await prisma.client.findUnique({ where: { id: entity.clientId } });
    if (client) {
      variables.clientName = client.type === 'INDIVIDUAL'
        ? `${client.firstName ?? ''} ${client.lastName ?? ''}`.trim()
        : client.companyName;
      variables.email = client.email;
      variables.phone = client.phone;
    }
  }

  if (entity?.policyId) {
    const policy = await prisma.policy.findUnique({
      where: { id: entity.policyId },
      include: { insurer: true, product: true, client: true },
    });
    if (policy) {
      variables.policyNumber = policy.policyNumber;
      variables.insurerName = policy.insurer.name;
      variables.productName = policy.product.name;
      variables.amount = policy.outstandingAmount?.toString();
      variables.dueDate = policy.endDate.toISOString().slice(0, 10);
      variables.clientName ??= policy.client.type === 'INDIVIDUAL'
        ? `${policy.client.firstName ?? ''} ${policy.client.lastName ?? ''}`.trim()
        : policy.client.companyName;
    }
  }

  if (entity?.claimId) {
    const claim = await prisma.claim.findUnique({ where: { id: entity.claimId }, include: { insurer: true } });
    if (claim) {
      variables.claimNumber = claim.claimNumber;
      variables.claimantName = claim.claimantName;
      variables.insurerName ??= claim.insurer.name;
    }
  }

  if (entity?.taskId) {
    const task = await prisma.task.findUnique({ where: { id: entity.taskId } });
    if (task) {
      variables.taskTitle = task.title;
      variables.dueDate ??= task.dueDate?.toISOString().slice(0, 10);
    }
  }

  if (entity?.paymentId) {
    const payment = await prisma.payment.findUnique({ where: { id: entity.paymentId } });
    if (payment) {
      variables.amount = payment.amount.toString();
      variables.paymentReference = payment.reference ?? payment.paymentNumber;
    }
  }

  if (entity?.userId) {
    const user = await prisma.user.findUnique({ where: { id: entity.userId } });
    if (user) variables.userName = `${user.firstName} ${user.lastName}`;
  }

  return variables;
}

export async function previewTemplate(id: string, variables: Record<string, unknown>, entity?: any) {
  const template = await getTemplate(id);
  const mergedVariables = { ...(template.variables as Record<string, unknown> | null ?? {}), ...(await buildEntityVariables(entity)), ...variables };
  return {
    subject: mergeTemplate(template.subject, mergedVariables),
    body: mergeTemplate(template.body, mergedVariables) ?? '',
    variables: mergedVariables,
  };
}
