import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database';
import { normalizeKenyanPhoneNumber } from '../../services/smsService';

export interface ResolvedRecipient {
  recipientType: 'CLIENT' | 'USER' | 'CUSTOM' | 'CONTACT_PERSON' | 'AGENT';
  recipientName?: string | null;
  email?: string | null;
  phone?: string | null;
  clientId?: string | null;
  userId?: string | null;
  agentId?: string | null;
  contactPersonId?: string | null;
}

export function clientName(client: { type?: string; firstName?: string | null; lastName?: string | null; companyName?: string | null }) {
  if (client.type === 'INDIVIDUAL') return `${client.firstName ?? ''} ${client.lastName ?? ''}`.trim();
  return client.companyName ?? `${client.firstName ?? ''} ${client.lastName ?? ''}`.trim();
}

export async function resolveRecipients(recipients: ResolvedRecipient[], channel: string): Promise<ResolvedRecipient[]> {
  const resolved: ResolvedRecipient[] = [];

  for (const recipient of recipients) {
    if (recipient.recipientType === 'CLIENT' && recipient.clientId && (!recipient.email || !recipient.phone)) {
      const client = await prisma.client.findUnique({ where: { id: recipient.clientId } });
      if (client) {
        resolved.push({
          ...recipient,
          recipientName: recipient.recipientName ?? clientName(client),
          email: recipient.email ?? client.email,
          phone: recipient.phone ?? client.phone,
        });
        continue;
      }
    }

    if (recipient.recipientType === 'USER' && recipient.userId && (!recipient.email || !recipient.phone)) {
      const user = await prisma.user.findUnique({ where: { id: recipient.userId } });
      if (user) {
        resolved.push({
          ...recipient,
          recipientName: recipient.recipientName ?? `${user.firstName} ${user.lastName}`,
          email: recipient.email ?? user.email,
          phone: recipient.phone ?? user.phone,
        });
        continue;
      }
    }

    if (recipient.recipientType === 'AGENT' && recipient.agentId && (!recipient.email || !recipient.phone)) {
      const agent = await prisma.agent.findUnique({ where: { id: recipient.agentId } });
      if (agent) {
        resolved.push({
          ...recipient,
          recipientName: recipient.recipientName ?? agent.companyName ?? `${agent.firstName ?? ''} ${agent.lastName ?? ''}`.trim(),
          email: recipient.email ?? agent.email,
          phone: recipient.phone ?? agent.phone,
        });
        continue;
      }
    }

    if (recipient.recipientType === 'CONTACT_PERSON' && recipient.contactPersonId && (!recipient.email || !recipient.phone)) {
      const contact = await prisma.clientContact.findUnique({ where: { id: recipient.contactPersonId } });
      if (contact) {
        resolved.push({
          ...recipient,
          recipientName: recipient.recipientName ?? contact.name,
          email: recipient.email ?? contact.email,
          phone: recipient.phone ?? contact.phone,
          clientId: recipient.clientId ?? contact.clientId,
        });
        continue;
      }
    }

    resolved.push(recipient);
  }

  const seen = new Set<string>();
  return resolved
    .map((recipient) => ({
      ...recipient,
      phone: recipient.phone ? normalizeKenyanPhoneNumber(recipient.phone) : recipient.phone,
    }))
    .filter((recipient) => {
      const address = channel === 'EMAIL' ? recipient.email : recipient.phone;
      if (!address) return false;
      const key = `${recipient.recipientType}:${address.toLowerCase()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

export async function searchRecipients(query: { q: string; type: string; limit: number }) {
  const q = query.q.trim();
  const take = query.limit;
  const payload: Record<string, unknown[]> = {};

  if (query.type === 'clients' || query.type === 'all') {
    const where: Prisma.ClientWhereInput = {
      deletedAt: null,
      ...(q
        ? {
            OR: [
              { clientNumber: { contains: q, mode: 'insensitive' } },
              { firstName: { contains: q, mode: 'insensitive' } },
              { lastName: { contains: q, mode: 'insensitive' } },
              { companyName: { contains: q, mode: 'insensitive' } },
              { email: { contains: q, mode: 'insensitive' } },
              { phone: { contains: q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const clients = await prisma.client.findMany({ where, take, orderBy: { createdAt: 'desc' } });
    payload.clients = clients.map((client) => ({
      recipientType: 'CLIENT',
      id: client.id,
      clientId: client.id,
      label: clientName(client),
      subtitle: client.clientNumber,
      email: client.email,
      phone: client.phone,
    }));
  }

  if (query.type === 'users' || query.type === 'all') {
    const users = await prisma.user.findMany({
      where: {
        isActive: true,
        deletedAt: null,
        ...(q
          ? {
              OR: [
                { firstName: { contains: q, mode: 'insensitive' } },
                { lastName: { contains: q, mode: 'insensitive' } },
                { email: { contains: q, mode: 'insensitive' } },
                { phone: { contains: q, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      take,
      orderBy: { firstName: 'asc' },
    });
    payload.users = users.map((user) => ({
      recipientType: 'USER',
      id: user.id,
      userId: user.id,
      label: `${user.firstName} ${user.lastName}`,
      subtitle: user.email,
      email: user.email,
      phone: user.phone,
    }));
  }

  if (query.type === 'agents' || query.type === 'all') {
    const agents = await prisma.agent.findMany({
      where: {
        deletedAt: null,
        ...(q
          ? {
              OR: [
                { firstName: { contains: q, mode: 'insensitive' } },
                { lastName: { contains: q, mode: 'insensitive' } },
                { companyName: { contains: q, mode: 'insensitive' } },
                { email: { contains: q, mode: 'insensitive' } },
                { phone: { contains: q, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      take,
      orderBy: { createdAt: 'desc' },
    });
    payload.agents = agents.map((agent) => ({
      recipientType: 'AGENT',
      id: agent.id,
      agentId: agent.id,
      label: agent.companyName ?? `${agent.firstName ?? ''} ${agent.lastName ?? ''}`.trim(),
      subtitle: agent.agentNumber,
      email: agent.email,
      phone: agent.phone,
    }));
  }

  return payload;
}

export async function previewAudience(input: {
  audienceType: string;
  channel?: string;
  filters?: Record<string, any>;
  customRecipients?: ResolvedRecipient[];
  limit?: number | null;
}) {
  const filters = input.filters ?? {};
  let recipients: ResolvedRecipient[] = [];

  if (input.audienceType === 'CLIENTS' || input.audienceType === 'MIXED') {
    const where: Prisma.ClientWhereInput = { deletedAt: null };
    if (filters.clientType) where.type = filters.clientType;
    if (filters.county) where.county = { equals: filters.county, mode: 'insensitive' };
    if (filters.relationshipManagerId) where.relationshipManagerId = filters.relationshipManagerId;
    const policyFilters: Prisma.PolicyWhereInput[] = [];
    if (filters.hasActivePolicy) policyFilters.push({ status: 'ACTIVE', deletedAt: null });
    if (filters.hasOutstandingPayment) policyFilters.push({ outstandingAmount: { gt: 0 }, deletedAt: null });
    if (policyFilters.length > 0) {
      where.AND = [
        ...((Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []) as Prisma.ClientWhereInput[]),
        ...policyFilters.map((policyFilter) => ({ policies: { some: policyFilter } })),
      ];
    }
    if (filters.hasOpenClaim) where.claims = { some: { status: { notIn: ['CLOSED', 'SETTLED', 'VOIDED', 'WITHDRAWN'] } } };

    const clients = await prisma.client.findMany({ where, take: 500 });
    recipients.push(...clients.map((client) => ({
      recipientType: 'CLIENT' as const,
      recipientName: clientName(client),
      email: client.email,
      phone: client.phone,
      clientId: client.id,
    })));
  }

  if (input.audienceType === 'USERS' || input.audienceType === 'MIXED') {
    const users = await prisma.user.findMany({
      where: {
        isActive: true,
        deletedAt: null,
        ...(filters.role
          ? { roles: { some: { role: { name: filters.role } } } }
          : {}),
      },
      take: 500,
    });
    recipients.push(...users.map((user) => ({
      recipientType: 'USER' as const,
      recipientName: `${user.firstName} ${user.lastName}`,
      email: user.email,
      phone: user.phone,
      userId: user.id,
    })));
  }

  if (input.audienceType === 'AGENTS' || input.audienceType === 'MIXED') {
    const agents = await prisma.agent.findMany({ where: { deletedAt: null }, take: 500 });
    recipients.push(...agents.map((agent) => ({
      recipientType: 'AGENT' as const,
      recipientName: agent.companyName ?? `${agent.firstName ?? ''} ${agent.lastName ?? ''}`.trim(),
      email: agent.email,
      phone: agent.phone,
      agentId: agent.id,
    })));
  }

  recipients.push(...(input.customRecipients ?? []));
  recipients = input.channel ? await resolveRecipients(recipients, input.channel) : recipients;
  const limit = input.limit === undefined ? 100 : input.limit;

  return {
    total: recipients.length,
    recipients: limit === null ? recipients : recipients.slice(0, limit),
    truncated: limit !== null && recipients.length > limit,
  };
}
