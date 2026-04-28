import { ClientType, Prisma } from '@prisma/client';
import { prisma } from '../../config/database';
import { CompleteLeadConversionInput } from './leadConversion.validation';

type MissingField = {
  key: string;
  label: string;
  severity: 'required' | 'recommended';
};

const RECOMMENDED_FIELD_LABELS: Record<string, string> = {
  email: 'Email',
  phone: 'Phone',
  kraPin: 'KRA PIN',
  nationalId: 'National ID',
  registrationNumber: 'Company registration number',
  physicalAddress: 'Physical address',
  county: 'County',
  industry: 'Occupation or business type',
  preferredChannel: 'Preferred communication channel',
};

function addDays(days: number): Date {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date;
}

function splitLeadName(name: string): { firstName: string | null; lastName: string | null } {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: null, lastName: null };
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(' ') || null,
  };
}

function clientDisplayName(client: any): string {
  return (
    `${client.firstName ?? ''} ${client.lastName ?? ''}`.trim() ||
    client.companyName ||
    client.tradingName ||
    client.clientNumber ||
    'client'
  );
}

function recommendedMissing(defaults: Record<string, any>, clientType: ClientType): MissingField[] {
  const keys = ['email', 'phone', 'kraPin', 'physicalAddress', 'county', 'preferredChannel'];

  if (clientType === 'INDIVIDUAL') {
    keys.push('nationalId', 'industry');
  } else {
    keys.push('registrationNumber', 'industry');
  }

  return keys
    .filter((key) => !defaults[key])
    .map((key) => ({
      key,
      label: RECOMMENDED_FIELD_LABELS[key] ?? key,
      severity: 'recommended' as const,
    }));
}

function buildClientDefaults(lead: any, requestedType?: ClientType, overrides: Record<string, any> = {}) {
  const type = requestedType ?? lead.leadType;
  const names = splitLeadName(lead.name);
  const isIndividual = type === 'INDIVIDUAL';

  return {
    type,
    firstName: isIndividual ? (overrides.firstName ?? names.firstName) : (overrides.firstName ?? null),
    lastName: isIndividual ? (overrides.lastName ?? names.lastName) : (overrides.lastName ?? null),
    companyName: !isIndividual ? (overrides.companyName ?? lead.companyName ?? lead.name) : (overrides.companyName ?? null),
    tradingName: overrides.tradingName ?? null,
    email: overrides.email ?? lead.email ?? null,
    phone: overrides.phone ?? lead.phone ?? null,
    kraPin: overrides.kraPin ?? null,
    nationalId: overrides.nationalId ?? null,
    passportNumber: overrides.passportNumber ?? null,
    registrationNumber: overrides.registrationNumber ?? null,
    physicalAddress: overrides.physicalAddress ?? null,
    postalAddress: overrides.postalAddress ?? null,
    county: overrides.county ?? null,
    industry: overrides.industry ?? null,
    preferredChannel: overrides.preferredChannel ?? null,
    riskCategory: overrides.riskCategory ?? null,
  };
}

async function generateClientNumber(tx: Prisma.TransactionClient): Promise<string> {
  const lastClient = await tx.client.findFirst({
    orderBy: { createdAt: 'desc' },
    select: { clientNumber: true },
  });

  if (!lastClient) return 'CL-000001';

  const lastNumber = parseInt(lastClient.clientNumber.split('-')[1], 10);
  return `CL-${(lastNumber + 1).toString().padStart(6, '0')}`;
}

async function generateCaseNumber(tx: Prisma.TransactionClient): Promise<string> {
  const lastCase = await tx.onboardingCase.findFirst({
    orderBy: { createdAt: 'desc' },
    select: { caseNumber: true },
  });

  if (!lastCase) return 'OB-000001';

  const lastNumber = parseInt(lastCase.caseNumber.split('-')[1], 10);
  return `OB-${(lastNumber + 1).toString().padStart(6, '0')}`;
}

async function createAutomationTask(
  tx: Prisma.TransactionClient,
  input: {
    title: string;
    description?: string;
    category: string;
    dueDate?: Date;
    leadId?: string | null;
    clientId?: string | null;
    onboardingCaseId?: string | null;
    policyId?: string | null;
    assignedToId?: string | null;
    createdById?: string;
  },
) {
  const task = await tx.task.create({
    data: {
      title: input.title,
      description: input.description ?? null,
      category: input.category,
      dueDate: input.dueDate ?? null,
      priority: 'NORMAL',
      leadId: input.leadId ?? null,
      clientId: input.clientId ?? null,
      onboardingCaseId: input.onboardingCaseId ?? null,
      policyId: input.policyId ?? null,
      assignedToId: input.assignedToId ?? null,
      createdById: input.createdById ?? null,
    },
  });

  await tx.taskActivity.create({
    data: {
      taskId: task.id,
      type: 'CREATED',
      description: 'Task created automatically by guided client flow',
      createdById: input.createdById ?? null,
      metadata: { category: input.category },
    },
  });

  return task;
}

export async function getLeadConversionPreview(leadId: string) {
  const lead = await prisma.lead.findFirst({
    where: { id: leadId, deletedAt: null },
    include: {
      assignedTo: { select: { id: true, firstName: true, lastName: true, email: true } },
      convertedToClient: { select: { id: true, clientNumber: true } },
    },
  });

  if (!lead) throw new Error('Lead not found');

  const defaults = buildClientDefaults(lead);
  const requiredMissing: MissingField[] = [];
  if (defaults.type === 'INDIVIDUAL' && !defaults.firstName) {
    requiredMissing.push({ key: 'firstName', label: 'First name', severity: 'required' });
  }
  if (defaults.type !== 'INDIVIDUAL' && !defaults.companyName) {
    requiredMissing.push({ key: 'companyName', label: 'Company or group name', severity: 'required' });
  }

  const recommended = recommendedMissing(defaults, defaults.type);

  return {
    lead,
    clientDefaults: defaults,
    requiredMissing,
    recommendedMissing: recommended,
    missingDetailsTask: {
      title: recommended.length
        ? `Follow up with client to complete missing profile details: ${recommended.map((f) => f.label).join(', ')}.`
        : null,
      dueDate: addDays(7).toISOString(),
    },
    onboardingTask: {
      title: 'Onboard client to an insurance product.',
      dueDate: addDays(7).toISOString(),
    },
    underwriterFollowUpDefaultDays: 5,
  };
}

export async function completeLeadConversion(
  leadId: string,
  input: CompleteLeadConversionInput,
  userId?: string,
) {
  return prisma.$transaction(async (tx) => {
    const lead = await tx.lead.findFirst({ where: { id: leadId, deletedAt: null } });
    if (!lead) throw new Error('Lead not found');
    if (lead.convertedToClientId) throw new Error('Lead has already been converted to a client');

    const clientType = (input.clientType ?? lead.leadType) as ClientType;
    const defaults = buildClientDefaults(lead, clientType, input.client ?? {});
    const missingFields = input.missingRecommendedFields.length
      ? input.missingRecommendedFields
      : recommendedMissing(defaults, clientType).map((field) => field.label);

    const clientNumber = await generateClientNumber(tx);
    const client = await tx.client.create({
      data: {
        clientNumber,
        type: clientType,
        firstName: defaults.firstName,
        lastName: defaults.lastName,
        companyName: defaults.companyName,
        tradingName: defaults.tradingName,
        email: defaults.email,
        phone: defaults.phone,
        kraPin: defaults.kraPin,
        nationalId: defaults.nationalId,
        passportNumber: defaults.passportNumber,
        registrationNumber: defaults.registrationNumber,
        physicalAddress: defaults.physicalAddress,
        postalAddress: defaults.postalAddress,
        county: defaults.county,
        industry: defaults.industry,
        preferredChannel: defaults.preferredChannel,
        riskCategory: defaults.riskCategory,
        relationshipManagerId: input.relationshipManagerId ?? lead.assignedToId ?? null,
        createdById: userId ?? null,
      },
    });

    const updatedLead = await tx.lead.update({
      where: { id: leadId },
      data: {
        convertedToClientId: client.id,
        convertedAt: new Date(),
        status: 'WON',
      },
      include: {
        assignedTo: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });

    await tx.leadActivity.create({
      data: {
        leadId,
        type: 'CONVERSION',
        description: `Lead converted to client ${client.clientNumber}`,
        userId: userId ?? null,
        metadata: {
          clientId: client.id,
          clientNumber: client.clientNumber,
          missingRecommendedFields: missingFields,
          guided: true,
        },
      },
    });

    const tasks = [];

    if (input.createMissingDetailsTask && missingFields.length > 0) {
      tasks.push(await createAutomationTask(tx, {
        title: `Follow up with client to complete missing profile details: ${missingFields.join(', ')}.`,
        description: `Client ${clientDisplayName(client)} was converted with recommended profile details still outstanding.`,
        category: 'CLIENT_PROFILE',
        dueDate: input.missingDetailsDueDate ? new Date(input.missingDetailsDueDate) : addDays(7),
        leadId,
        clientId: client.id,
        assignedToId: input.relationshipManagerId ?? lead.assignedToId ?? null,
        createdById: userId,
      }));
    }

    let onboardingCase = null;
    if (input.startOnboardingNow) {
      const caseNumber = await generateCaseNumber(tx);
      onboardingCase = await tx.onboardingCase.create({
        data: {
          caseNumber,
          clientId: client.id,
          leadId,
          productId: input.onboarding?.productId ?? null,
          insurerId: input.onboarding?.insurerId ?? null,
          clientType,
          premiumEstimate: input.onboarding?.premiumEstimate ?? null,
          riskDetails: (input.onboarding?.riskDetails ?? Prisma.JsonNull) as Prisma.InputJsonValue,
          memberData: (input.onboarding?.memberData ?? Prisma.JsonNull) as Prisma.InputJsonValue,
          createdById: userId ?? null,
        },
      });

      await tx.leadActivity.create({
        data: {
          leadId,
          type: 'ONBOARDING_STARTED',
          description: `Onboarding case ${onboardingCase.caseNumber} started for client ${client.clientNumber}`,
          userId: userId ?? null,
          metadata: { onboardingCaseId: onboardingCase.id, caseNumber },
        },
      });
    } else if (input.createOnboardingTask) {
      tasks.push(await createAutomationTask(tx, {
        title: 'Onboard client to an insurance product.',
        description: `Start onboarding for ${clientDisplayName(client)} and capture KYC, product, insurer, document, and member/dependant requirements.`,
        category: 'ONBOARDING',
        dueDate: input.onboardingDueDate ? new Date(input.onboardingDueDate) : addDays(7),
        leadId,
        clientId: client.id,
        assignedToId: input.relationshipManagerId ?? lead.assignedToId ?? null,
        createdById: userId,
      }));
    }

    return {
      lead: updatedLead,
      client,
      onboardingCase,
      tasks,
      nextStep: onboardingCase ? 'ONBOARDING' : 'FOLLOW_UP',
    };
  });
}
