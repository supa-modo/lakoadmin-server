import { prisma } from '../../config/database';
import { AuthRequest } from '../../types/express';
import { OnboardingCase, OnboardingDocument, Prisma } from '@prisma/client';
import { generatePolicyNumber } from '../policies/policyNumber.service';
import { calculatePremium } from '../policies/premium.service';
import { ensureWorkflowTask } from '../workflows/workflowTaskAutomation.service';

interface ListOnboardingResult {
  cases: OnboardingCase[];
  total: number;
  page: number;
  limit: number;
}

export async function listOnboardingCases(req: AuthRequest): Promise<ListOnboardingResult> {
  const {
    page = 1,
    limit = 20,
    status,
    clientType,
  } = req.query as {
    page?: number;
    limit?: number;
    status?: string;
    clientType?: string;
  };

  const where: Prisma.OnboardingCaseWhereInput = {};

  if (status) {
    where.status = status as any;
  }

  if (clientType) {
    where.clientType = clientType as any;
  }

  const skip = (page - 1) * limit;

  const [cases, total] = await Promise.all([
    prisma.onboardingCase.findMany({
      where,
      include: {
        client: {
          select: {
            id: true,
            clientNumber: true,
            type: true,
            firstName: true,
            lastName: true,
            companyName: true,
            email: true,
            phone: true,
          },
        },
        lead: { select: { id: true, name: true, source: true, expectedPremium: true } },
        product: { select: { id: true, name: true, code: true, category: true, requiredDocuments: true } },
        insurer: { select: { id: true, name: true, shortName: true } },
        documents: {
          select: {
            id: true,
            documentType: true,
            status: true,
          },
        },
        _count: {
          select: {
            documents: true,
          },
        },
      },
      skip,
      take: limit,
      orderBy: {
        createdAt: 'desc',
      },
    }),
    prisma.onboardingCase.count({ where }),
  ]);

  return {
    cases,
    total,
    page,
    limit,
  };
}

export async function getOnboardingCaseById(id: string): Promise<OnboardingCase> {
  const onboardingCase = await prisma.onboardingCase.findUnique({
    where: { id },
    include: {
      client: {
        select: {
          id: true,
          clientNumber: true,
          type: true,
          firstName: true,
          lastName: true,
          companyName: true,
          email: true,
          phone: true,
          kraPin: true,
          nationalId: true,
        },
      },
      documents: {
        orderBy: {
          createdAt: 'desc',
        },
      },
      lead: { select: { id: true, name: true, source: true, expectedPremium: true } },
      product: { select: { id: true, name: true, code: true, category: true, requiredDocuments: true } },
      insurer: { select: { id: true, name: true, shortName: true } },
      policies: { select: { id: true, policyNumber: true, status: true, totalPremium: true, outstandingAmount: true } },
      tasks: {
        where: { status: { not: 'CANCELLED' } },
        orderBy: { dueDate: 'asc' },
      },
    },
  });

  if (!onboardingCase) {
    throw new Error('Onboarding case not found');
  }

  return onboardingCase;
}

export async function createOnboardingCase(data: any, createdById?: string): Promise<OnboardingCase> {
  const client = await prisma.client.findUnique({
    where: { id: data.clientId },
  });

  if (!client || client.deletedAt) {
    throw new Error('Client not found');
  }

  const existingCase = await prisma.onboardingCase.findFirst({
    where: {
      clientId: data.clientId,
      status: {
        notIn: ['APPROVED', 'REJECTED'],
      },
    },
  });

  if (existingCase) {
    throw new Error('Client already has an active onboarding case');
  }

  const caseNumber = await generateCaseNumber();

  const onboardingCase = await prisma.onboardingCase.create({
    data: {
      caseNumber,
      clientId: data.clientId,
      clientType: data.clientType ?? client.type,
      leadId: data.leadId ?? null,
      productId: data.productId ?? null,
      insurerId: data.insurerId ?? null,
      premiumEstimate: data.premiumEstimate ?? null,
      riskDetails: (data.riskDetails ?? Prisma.JsonNull) as Prisma.InputJsonValue,
      memberData: (data.memberData ?? Prisma.JsonNull) as Prisma.InputJsonValue,
      createdById,
    },
    include: {
      client: {
        select: {
          id: true,
          clientNumber: true,
          firstName: true,
          lastName: true,
          companyName: true,
        },
      },
      lead: { select: { id: true, name: true } },
      product: { select: { id: true, name: true, code: true } },
      insurer: { select: { id: true, name: true, shortName: true } },
    },
  });

  return onboardingCase;
}

export async function updateOnboardingCase(id: string, data: any): Promise<OnboardingCase> {
  const existing = await prisma.onboardingCase.findUnique({
    where: { id },
  });

  if (!existing) {
    throw new Error('Onboarding case not found');
  }

  const onboardingCase = await prisma.onboardingCase.update({
    where: { id },
    data: {
      ...(data.leadId !== undefined && { leadId: data.leadId }),
      ...(data.productId !== undefined && { productId: data.productId }),
      ...(data.insurerId !== undefined && { insurerId: data.insurerId }),
      ...(data.premiumEstimate !== undefined && { premiumEstimate: data.premiumEstimate }),
      ...(data.riskDetails !== undefined && { riskDetails: (data.riskDetails ?? Prisma.JsonNull) as Prisma.InputJsonValue }),
      ...(data.memberData !== undefined && { memberData: (data.memberData ?? Prisma.JsonNull) as Prisma.InputJsonValue }),
      ...(data.status !== undefined && { status: data.status }),
      ...(data.reviewNotes !== undefined && { reviewNotes: data.reviewNotes }),
    },
    include: {
      client: {
        select: {
          id: true,
          clientNumber: true,
          firstName: true,
          lastName: true,
          companyName: true,
        },
      },
      lead: { select: { id: true, name: true } },
      product: { select: { id: true, name: true, code: true } },
      insurer: { select: { id: true, name: true, shortName: true } },
    },
  });

  return onboardingCase;
}

export async function startClientOnboarding(
  clientId: string,
  data: any,
  createdById?: string
): Promise<OnboardingCase> {
  const client = await prisma.client.findFirst({
    where: { id: clientId, deletedAt: null },
    include: { lead: { select: { id: true } } },
  });

  if (!client) {
    throw new Error('Client not found');
  }

  return createOnboardingCase({
    ...data,
    clientId,
    clientType: data.clientType ?? client.type,
    leadId: data.leadId ?? client.lead?.id ?? null,
  }, createdById);
}

function asMemberRows(memberData: Prisma.JsonValue | null | undefined): any[] {
  if (!memberData || typeof memberData !== 'object' || Array.isArray(memberData)) return [];
  const maybeMembers = (memberData as any).members;
  return Array.isArray(maybeMembers) ? maybeMembers : [];
}

function addDays(days: number): Date {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date;
}

function clientName(client: any): string {
  return `${client.firstName ?? ''} ${client.lastName ?? ''}`.trim() || client.companyName || client.clientNumber;
}

export async function createPolicyFromOnboardingCase(
  onboardingCaseId: string,
  data: any,
  createdById?: string
) {
  const onboardingCase = await prisma.onboardingCase.findUnique({
    where: { id: onboardingCaseId },
    include: {
      client: true,
      product: true,
      insurer: true,
      documents: true,
    },
  });

  if (!onboardingCase) throw new Error('Onboarding case not found');
  if (!onboardingCase.productId || !onboardingCase.insurerId) {
    throw new Error('Product and insurer must be selected before creating a policy');
  }

  if (!['APPROVED', 'UNDER_REVIEW', 'DOCUMENTS_PENDING'].includes(onboardingCase.status)) {
    throw new Error('Onboarding must be approved or sufficiently complete before policy creation');
  }

  const basePremium = data.basePremium ?? Number(onboardingCase.premiumEstimate ?? 0);
  if (!basePremium || basePremium <= 0) {
    throw new Error('Base premium is required before creating a policy');
  }

  const policyNumber = await generatePolicyNumber();
  const breakdown = calculatePremium({
    basePremium,
    policyFee: data.policyFee ?? 0,
  });

  const result = await prisma.$transaction(async (tx) => {
    const policy = await tx.policy.create({
      data: {
        policyNumber,
        insurerPolicyNumber: data.insurerPolicyNumber ?? null,
        clientId: onboardingCase.clientId,
        productId: onboardingCase.productId!,
        insurerId: onboardingCase.insurerId!,
        onboardingCaseId: onboardingCase.id,
        sourceLeadId: onboardingCase.leadId,
        startDate: new Date(data.startDate),
        endDate: new Date(data.endDate),
        sumInsured: data.sumInsured ?? null,
        basePremium: breakdown.basePremium,
        trainingLevy: breakdown.trainingLevy,
        pcifLevy: breakdown.pcifLevy,
        stampDuty: breakdown.stampDuty,
        policyFee: breakdown.policyFee,
        totalPremium: breakdown.totalPremium,
        outstandingAmount: breakdown.totalPremium,
        paymentFrequency: data.paymentFrequency ?? 'ANNUAL',
        status: 'PENDING_PAYMENT',
        underwritingStatus: 'PENDING',
        notes: data.notes ?? null,
        createdById: createdById ?? null,
      },
      include: {
        client: { select: { id: true, firstName: true, lastName: true, companyName: true, tradingName: true, type: true } },
        product: { select: { id: true, name: true, code: true } },
        insurer: { select: { id: true, name: true, shortName: true } },
      },
    });

    const members = asMemberRows(onboardingCase.memberData as Prisma.JsonValue);
    for (const member of members) {
      if (!member?.name || !member?.relationship) continue;
      await tx.policyMember.create({
        data: {
          policyId: policy.id,
          name: member.name,
          relationship: member.relationship,
          dateOfBirth: member.dateOfBirth ? new Date(member.dateOfBirth) : null,
          gender: member.gender ?? null,
          idNumber: member.idNumber ?? null,
          effectiveDate: member.effectiveDate ? new Date(member.effectiveDate) : new Date(data.startDate),
          premiumAmount: member.premiumAmount ?? null,
          status: 'ACTIVE',
        },
      });
    }

    const underwriterTask = data.createUnderwriterTask === false ? null : await ensureWorkflowTask(tx, {
        title: 'Follow up with underwriter to confirm policy issuance and collect official policy documents.',
        description: [
          `Client: ${clientName(onboardingCase.client)}`,
          `Product: ${onboardingCase.product?.name ?? 'Selected product'}`,
          `Insurer: ${onboardingCase.insurer?.name ?? 'Selected insurer'}`,
          `Internal policy reference: ${policy.policyNumber}`,
          `Payment status: Pending payment`,
          'Required: underwriter policy number, policy schedule, certificate, debit or credit note where applicable, and endorsement documents where relevant.',
        ].join('\n'),
        category: 'UNDERWRITER_FOLLOW_UP',
        dueDate: data.underwriterFollowUpDueDate ? new Date(data.underwriterFollowUpDueDate) : addDays(5),
        leadId: onboardingCase.leadId,
        clientId: onboardingCase.clientId,
        onboardingCaseId: onboardingCase.id,
        policyId: policy.id,
        assignedToId: createdById ?? null,
        createdById: createdById ?? null,
        dedupeBy: ['title', 'category', 'policyId'],
    });

    await tx.policyEvent.create({
      data: {
        policyId: policy.id,
        eventType: 'CREATED_FROM_ONBOARDING',
        description: `Policy ${policy.policyNumber} created from onboarding case ${onboardingCase.caseNumber}`,
        userId: createdById ?? null,
        metadata: {
          onboardingCaseId: onboardingCase.id,
          caseNumber: onboardingCase.caseNumber,
          membersCreated: members.length,
          underwriterTaskId: underwriterTask?.id,
        },
      },
    });

    return { policy, underwriterTask, membersCreated: members.length };
  });

  return result;
}

export async function uploadDocument(
  caseId: string,
  documentType: string,
  file: { filename: string; path: string; size: number; mimetype: string },
  expiryDate?: string
): Promise<OnboardingDocument> {
  const onboardingCase = await prisma.onboardingCase.findUnique({
    where: { id: caseId },
  });

  if (!onboardingCase) {
    throw new Error('Onboarding case not found');
  }

  if (onboardingCase.status === 'APPROVED' || onboardingCase.status === 'REJECTED') {
    throw new Error('Cannot upload documents to a closed onboarding case');
  }

  const document = await prisma.onboardingDocument.create({
    data: {
      onboardingCaseId: caseId,
      documentType,
      fileName: file.filename,
      fileUrl: file.path,
      fileSize: file.size,
      mimeType: file.mimetype,
      expiryDate: expiryDate ? new Date(expiryDate) : null,
    },
  });

  await prisma.onboardingCase.update({
    where: { id: caseId },
    data: {
      status: 'DOCUMENTS_PENDING',
    },
  });

  return document;
}

export async function verifyDocument(
  caseId: string,
  documentId: string,
  status: 'VERIFIED' | 'REJECTED',
  rejectionReason?: string,
  verifiedById?: string
): Promise<OnboardingDocument> {
  const document = await prisma.onboardingDocument.findFirst({
    where: {
      id: documentId,
      onboardingCaseId: caseId,
    },
  });

  if (!document) {
    throw new Error('Document not found');
  }

  const updatedDocument = await prisma.onboardingDocument.update({
    where: { id: documentId },
    data: {
      status: status as any,
      verifiedById,
      verifiedAt: new Date(),
      rejectionReason,
    },
  });

  return updatedDocument;
}

export async function submitOnboarding(id: string): Promise<OnboardingCase> {
  const onboardingCase = await prisma.onboardingCase.findUnique({
    where: { id },
    include: {
      documents: true,
    },
  });

  if (!onboardingCase) {
    throw new Error('Onboarding case not found');
  }

  if (onboardingCase.status !== 'DOCUMENTS_PENDING' && onboardingCase.status !== 'DRAFT') {
    throw new Error('Onboarding case cannot be submitted in current status');
  }

  if (onboardingCase.documents.length === 0) {
    throw new Error('Cannot submit onboarding without documents');
  }

  const updated = await prisma.onboardingCase.update({
    where: { id },
    data: {
      status: 'UNDER_REVIEW',
      submittedAt: new Date(),
    },
  });

  return updated;
}

export async function approveOnboarding(
  id: string,
  reviewNotes?: string,
  reviewerId?: string
): Promise<OnboardingCase> {
  const onboardingCase = await prisma.onboardingCase.findUnique({
    where: { id },
  });

  if (!onboardingCase) {
    throw new Error('Onboarding case not found');
  }

  if (onboardingCase.status !== 'UNDER_REVIEW') {
    throw new Error('Only cases under review can be approved');
  }

  const updated = await prisma.onboardingCase.update({
    where: { id },
    data: {
      status: 'APPROVED',
      reviewerId,
      reviewNotes,
      reviewedAt: new Date(),
      approvedAt: new Date(),
    },
  });

  return updated;
}

export async function rejectOnboarding(
  id: string,
  rejectionReason: string,
  reviewerId?: string
): Promise<OnboardingCase> {
  const onboardingCase = await prisma.onboardingCase.findUnique({
    where: { id },
  });

  if (!onboardingCase) {
    throw new Error('Onboarding case not found');
  }

  if (onboardingCase.status !== 'UNDER_REVIEW') {
    throw new Error('Only cases under review can be rejected');
  }

  const updated = await prisma.onboardingCase.update({
    where: { id },
    data: {
      status: 'REJECTED',
      reviewerId,
      rejectionReason,
      reviewedAt: new Date(),
      rejectedAt: new Date(),
    },
  });

  return updated;
}

async function generateCaseNumber(): Promise<string> {
  const lastCase = await prisma.onboardingCase.findFirst({
    orderBy: { createdAt: 'desc' },
    select: { caseNumber: true },
  });

  if (!lastCase) {
    return 'OB-000001';
  }

  const lastNumber = parseInt(lastCase.caseNumber.split('-')[1]);
  const nextNumber = lastNumber + 1;
  return `OB-${nextNumber.toString().padStart(6, '0')}`;
}
