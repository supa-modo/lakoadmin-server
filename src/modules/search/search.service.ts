import { prisma } from '../../config/database';
import { AuthUser } from '../../types/express';

type SearchEntity =
  | 'clients'
  | 'leads'
  | 'policies'
  | 'claims'
  | 'products'
  | 'insurers'
  | 'vendors'
  | 'agents'
  | 'tasks'
  | 'payments';

type DetailMode = 'route' | 'modal' | 'page';

export interface UniversalSearchResult {
  id: string;
  type: SearchEntity;
  module: string;
  label: string;
  title: string;
  subtitle?: string;
  description?: string;
  status?: string;
  href: string;
  detailMode: DetailMode;
  permission: string;
  meta?: Record<string, unknown>;
}

export interface UniversalSearchGroup {
  type: SearchEntity;
  label: string;
  permission: string;
  results: UniversalSearchResult[];
}

export interface UniversalSearchResponse {
  query: string;
  total: number;
  groups: UniversalSearchGroup[];
  results: UniversalSearchResult[];
}

const SOURCE_LABELS: Record<SearchEntity, string> = {
  clients: 'Clients',
  leads: 'Leads',
  policies: 'Policies',
  claims: 'Claims',
  products: 'Insurance Products',
  insurers: 'Insurers',
  vendors: 'Vendors',
  agents: 'Agents',
  tasks: 'Tasks',
  payments: 'Payments',
};

const SOURCE_PERMISSIONS: Record<SearchEntity, string> = {
  clients: 'clients.read',
  leads: 'leads.read',
  policies: 'policies.read',
  claims: 'claims.read',
  products: 'products.read',
  insurers: 'products.read',
  vendors: 'accounting.vendors.manage',
  agents: 'agents.read',
  tasks: 'tasks.read',
  payments: 'payments.read',
};

const MAX_LIMIT = 10;

function can(user: AuthUser, permission: string): boolean {
  return user.permissions.includes(permission);
}

function contains(query: string) {
  return { contains: query, mode: 'insensitive' as const };
}

function clean(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  const text = String(value).trim();
  return text || undefined;
}

function clientName(client: any): string {
  const individualName = [client.firstName, client.lastName].map(clean).filter(Boolean).join(' ');
  return clean(client.displayName) ?? clean(individualName) ?? clean(client.companyName) ?? client.clientNumber;
}

function agentName(agent: any): string {
  return [agent.firstName, agent.lastName].map(clean).filter(Boolean).join(' ') || clean(agent.companyName) || agent.agentNumber;
}

function withOpen(path: string, open: string, id: string): string {
  return `${path}?open=${encodeURIComponent(open)}&id=${encodeURIComponent(id)}`;
}

async function searchClients(query: string, limit: number): Promise<UniversalSearchGroup> {
  const rows = await prisma.client.findMany({
    where: {
      deletedAt: null,
      OR: [
        { clientNumber: contains(query) },
        { firstName: contains(query) },
        { lastName: contains(query) },
        { companyName: contains(query) },
        { tradingName: contains(query) },
        { email: contains(query) },
        { phone: contains(query) },
        { nationalId: contains(query) },
        { kraPin: contains(query) },
      ],
    },
    orderBy: { updatedAt: 'desc' },
    take: limit,
  });

  return {
    type: 'clients',
    label: SOURCE_LABELS.clients,
    permission: SOURCE_PERMISSIONS.clients,
    results: rows.map((client) => ({
      id: client.id,
      type: 'clients',
      module: 'CRM',
      label: SOURCE_LABELS.clients,
      title: clientName(client),
      subtitle: client.clientNumber,
      description: [client.email, client.phone, client.kraPin].map(clean).filter(Boolean).join(' · '),
      status: clean(client.riskCategory) ?? clean(client.type),
      href: `/admin/crm/clients/${client.id}`,
      detailMode: 'route',
      permission: SOURCE_PERMISSIONS.clients,
    })),
  };
}

async function searchLeads(query: string, limit: number): Promise<UniversalSearchGroup> {
  const rows = await prisma.lead.findMany({
    where: {
      deletedAt: null,
      OR: [
        { name: contains(query) },
        { companyName: contains(query) },
        { email: contains(query) },
        { phone: contains(query) },
        { source: contains(query) },
      ],
    },
    orderBy: { updatedAt: 'desc' },
    take: limit,
    include: { assignedTo: { select: { firstName: true, lastName: true } } },
  });

  return {
    type: 'leads',
    label: SOURCE_LABELS.leads,
    permission: SOURCE_PERMISSIONS.leads,
    results: rows.map((lead) => ({
      id: lead.id,
      type: 'leads',
      module: 'CRM',
      label: SOURCE_LABELS.leads,
      title: lead.name,
      subtitle: lead.companyName ?? lead.email ?? lead.phone ?? undefined,
      description: [lead.source, lead.assignedTo ? `Assigned to ${lead.assignedTo.firstName} ${lead.assignedTo.lastName}` : null]
        .map(clean)
        .filter(Boolean)
        .join(' · '),
      status: lead.status,
      href: withOpen('/admin/crm/leads', 'lead', lead.id),
      detailMode: 'modal',
      permission: SOURCE_PERMISSIONS.leads,
    })),
  };
}

async function searchPolicies(query: string, limit: number): Promise<UniversalSearchGroup> {
  const rows = await prisma.policy.findMany({
    where: {
      deletedAt: null,
      OR: [
        { policyNumber: contains(query) },
        { insurerPolicyNumber: contains(query) },
        { client: { OR: [{ clientNumber: contains(query) }, { firstName: contains(query) }, { lastName: contains(query) }, { companyName: contains(query) }] } },
        { insurer: { name: contains(query) } },
        { product: { name: contains(query) } },
      ],
    },
    orderBy: { updatedAt: 'desc' },
    take: limit,
    include: { client: true, insurer: true, product: true },
  });

  return {
    type: 'policies',
    label: SOURCE_LABELS.policies,
    permission: SOURCE_PERMISSIONS.policies,
    results: rows.map((policy) => ({
      id: policy.id,
      type: 'policies',
      module: 'Policy Operations',
      label: SOURCE_LABELS.policies,
      title: policy.policyNumber,
      subtitle: clientName(policy.client),
      description: [policy.product?.name, policy.insurer?.name].map(clean).filter(Boolean).join(' · '),
      status: policy.status,
      href: withOpen('/policies', 'policy', policy.id),
      detailMode: 'modal',
      permission: SOURCE_PERMISSIONS.policies,
      meta: { totalPremium: policy.totalPremium, outstandingAmount: policy.outstandingAmount },
    })),
  };
}

async function searchClaims(query: string, limit: number): Promise<UniversalSearchGroup> {
  const rows = await prisma.claim.findMany({
    where: {
      deletedAt: null,
      OR: [
        { claimNumber: contains(query) },
        { insurerClaimNumber: contains(query) },
        { claimantName: contains(query) },
        { claimantPhone: contains(query) },
        { claimantEmail: contains(query) },
        { lossType: contains(query) },
        { policy: { policyNumber: contains(query) } },
        { client: { OR: [{ clientNumber: contains(query) }, { firstName: contains(query) }, { lastName: contains(query) }, { companyName: contains(query) }] } },
      ],
    },
    orderBy: { updatedAt: 'desc' },
    take: limit,
    include: { client: true, policy: true, insurer: true },
  });

  return {
    type: 'claims',
    label: SOURCE_LABELS.claims,
    permission: SOURCE_PERMISSIONS.claims,
    results: rows.map((claim) => ({
      id: claim.id,
      type: 'claims',
      module: 'Claims',
      label: SOURCE_LABELS.claims,
      title: claim.claimNumber,
      subtitle: claim.claimantName,
      description: [claim.policy?.policyNumber, clientName(claim.client), claim.insurer?.name].map(clean).filter(Boolean).join(' · '),
      status: claim.status,
      href: `/claims/${claim.id}`,
      detailMode: 'route',
      permission: SOURCE_PERMISSIONS.claims,
      meta: { amountClaimed: claim.amountClaimed, priority: claim.priority },
    })),
  };
}

async function searchProducts(query: string, limit: number): Promise<UniversalSearchGroup> {
  const rows = await prisma.product.findMany({
    where: {
      deletedAt: null,
      OR: [
        { code: contains(query) },
        { name: contains(query) },
        { category: contains(query) },
        { subcategory: contains(query) },
        { description: contains(query) },
        { insurer: { name: contains(query) } },
        { insurer: { shortName: contains(query) } },
      ],
    },
    orderBy: { updatedAt: 'desc' },
    take: limit,
    include: { insurer: true },
  });

  return {
    type: 'products',
    label: SOURCE_LABELS.products,
    permission: SOURCE_PERMISSIONS.products,
    results: rows.map((product) => ({
      id: product.id,
      type: 'products',
      module: 'Product Catalog',
      label: SOURCE_LABELS.products,
      title: product.name,
      subtitle: product.code,
      description: [product.insurer?.name, product.category, product.insuranceClass].map(clean).filter(Boolean).join(' · '),
      status: product.status,
      href: withOpen('/catalog/products', 'product', product.id),
      detailMode: 'modal',
      permission: SOURCE_PERMISSIONS.products,
    })),
  };
}

async function searchInsurers(query: string, limit: number): Promise<UniversalSearchGroup> {
  const rows = await prisma.insurer.findMany({
    where: {
      deletedAt: null,
      OR: [
        { name: contains(query) },
        { shortName: contains(query) },
        { registrationNumber: contains(query) },
        { iraLicenseNumber: contains(query) },
        { email: contains(query) },
        { phone: contains(query) },
      ],
    },
    orderBy: { updatedAt: 'desc' },
    take: limit,
    include: { _count: { select: { products: true, policies: true, claims: true } } },
  });

  return {
    type: 'insurers',
    label: SOURCE_LABELS.insurers,
    permission: SOURCE_PERMISSIONS.insurers,
    results: rows.map((insurer) => ({
      id: insurer.id,
      type: 'insurers',
      module: 'Product Catalog',
      label: SOURCE_LABELS.insurers,
      title: insurer.name,
      subtitle: insurer.shortName ?? insurer.iraLicenseNumber ?? undefined,
      description: `${insurer._count.products} products · ${insurer._count.policies} policies · ${insurer._count.claims} claims`,
      status: insurer.status,
      href: withOpen('/catalog/insurers', 'insurer', insurer.id),
      detailMode: 'modal',
      permission: SOURCE_PERMISSIONS.insurers,
    })),
  };
}

async function searchVendors(query: string, limit: number): Promise<UniversalSearchGroup> {
  const rows = await prisma.vendor.findMany({
    where: {
      deletedAt: null,
      OR: [
        { name: contains(query) },
        { vendorType: contains(query) },
        { contactPerson: contains(query) },
        { email: contains(query) },
        { phone: contains(query) },
        { kraPin: contains(query) },
      ],
    },
    orderBy: { updatedAt: 'desc' },
    take: limit,
  });

  return {
    type: 'vendors',
    label: SOURCE_LABELS.vendors,
    permission: SOURCE_PERMISSIONS.vendors,
    results: rows.map((vendor) => ({
      id: vendor.id,
      type: 'vendors',
      module: 'Accounting & Finance',
      label: SOURCE_LABELS.vendors,
      title: vendor.name,
      subtitle: vendor.vendorType ?? vendor.contactPerson ?? undefined,
      description: [vendor.email, vendor.phone, vendor.kraPin].map(clean).filter(Boolean).join(' · '),
      status: vendor.status,
      href: withOpen('/accounting/vendors', 'vendor', vendor.id),
      detailMode: 'modal',
      permission: SOURCE_PERMISSIONS.vendors,
    })),
  };
}

async function searchAgents(query: string, limit: number): Promise<UniversalSearchGroup> {
  const rows = await prisma.agent.findMany({
    where: {
      deletedAt: null,
      OR: [
        { agentNumber: contains(query) },
        { agentCode: contains(query) },
        { firstName: contains(query) },
        { lastName: contains(query) },
        { companyName: contains(query) },
        { email: contains(query) },
        { phone: contains(query) },
        { kraPin: contains(query) },
      ],
    },
    orderBy: { updatedAt: 'desc' },
    take: limit,
    include: { _count: { select: { policies: true, commissionEntries: true } } },
  });

  return {
    type: 'agents',
    label: SOURCE_LABELS.agents,
    permission: SOURCE_PERMISSIONS.agents,
    results: rows.map((agent) => ({
      id: agent.id,
      type: 'agents',
      module: 'Distribution',
      label: SOURCE_LABELS.agents,
      title: agentName(agent),
      subtitle: [agent.agentNumber, agent.agentCode].map(clean).filter(Boolean).join(' / '),
      description: `${agent._count.policies} policies · ${agent._count.commissionEntries} commission records`,
      status: agent.status,
      href: withOpen('/agents', 'agent', agent.id),
      detailMode: 'modal',
      permission: SOURCE_PERMISSIONS.agents,
    })),
  };
}

async function searchTasks(query: string, limit: number): Promise<UniversalSearchGroup> {
  const rows = await prisma.task.findMany({
    where: {
      OR: [
        { title: contains(query) },
        { description: contains(query) },
        { category: contains(query) },
        { client: { OR: [{ clientNumber: contains(query) }, { firstName: contains(query) }, { lastName: contains(query) }, { companyName: contains(query) }] } },
        { policy: { policyNumber: contains(query) } },
        { claim: { claimNumber: contains(query) } },
      ],
    },
    orderBy: { updatedAt: 'desc' },
    take: limit,
    include: { assignedTo: { select: { firstName: true, lastName: true } }, client: true, policy: true, claim: true },
  });

  return {
    type: 'tasks',
    label: SOURCE_LABELS.tasks,
    permission: SOURCE_PERMISSIONS.tasks,
    results: rows.map((task) => ({
      id: task.id,
      type: 'tasks',
      module: 'Operations',
      label: SOURCE_LABELS.tasks,
      title: task.title,
      subtitle: task.category ?? task.priority,
      description: [task.client ? clientName(task.client) : null, task.policy?.policyNumber, task.claim?.claimNumber].map(clean).filter(Boolean).join(' · '),
      status: task.status,
      href: withOpen('/admin/crm/tasks', 'task', task.id),
      detailMode: 'modal',
      permission: SOURCE_PERMISSIONS.tasks,
    })),
  };
}

async function searchPayments(query: string, limit: number): Promise<UniversalSearchGroup> {
  const rows = await prisma.payment.findMany({
    where: {
      deletedAt: null,
      OR: [
        { paymentNumber: contains(query) },
        { reference: contains(query) },
        { transactionCode: contains(query) },
        { client: { OR: [{ clientNumber: contains(query) }, { firstName: contains(query) }, { lastName: contains(query) }, { companyName: contains(query) }] } },
      ],
    },
    orderBy: { updatedAt: 'desc' },
    take: limit,
    include: { client: true },
  });

  return {
    type: 'payments',
    label: SOURCE_LABELS.payments,
    permission: SOURCE_PERMISSIONS.payments,
    results: rows.map((payment) => ({
      id: payment.id,
      type: 'payments',
      module: 'Revenue Flows',
      label: SOURCE_LABELS.payments,
      title: payment.paymentNumber,
      subtitle: clientName(payment.client),
      description: [payment.reference, payment.transactionCode, payment.method].map(clean).filter(Boolean).join(' · '),
      status: payment.status,
      href: `/payments?search=${encodeURIComponent(payment.paymentNumber)}`,
      detailMode: 'page',
      permission: SOURCE_PERMISSIONS.payments,
      meta: { amount: payment.amount },
    })),
  };
}

const SEARCHERS: Record<SearchEntity, (query: string, limit: number) => Promise<UniversalSearchGroup>> = {
  clients: searchClients,
  leads: searchLeads,
  policies: searchPolicies,
  claims: searchClaims,
  products: searchProducts,
  insurers: searchInsurers,
  vendors: searchVendors,
  agents: searchAgents,
  tasks: searchTasks,
  payments: searchPayments,
};

export async function universalSearch(user: AuthUser, query: string, requestedLimit = 6): Promise<UniversalSearchResponse> {
  const normalized = query.trim();
  const limit = Math.min(MAX_LIMIT, Math.max(3, requestedLimit || 6));

  if (normalized.length < 2) {
    return { query: normalized, total: 0, groups: [], results: [] };
  }

  const allowedSources = (Object.keys(SEARCHERS) as SearchEntity[]).filter((source) => can(user, SOURCE_PERMISSIONS[source]));
  const settled = await Promise.allSettled(allowedSources.map((source) => SEARCHERS[source](normalized, limit)));
  const groups = settled
    .filter((result): result is PromiseFulfilledResult<UniversalSearchGroup> => result.status === 'fulfilled')
    .map((result) => result.value)
    .filter((group) => group.results.length > 0);
  const results = groups.flatMap((group) => group.results);

  return {
    query: normalized,
    total: results.length,
    groups,
    results,
  };
}
