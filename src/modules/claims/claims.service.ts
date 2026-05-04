import { ClaimStatus, Prisma } from '@prisma/client';
import { prisma } from '../../config/database';
import { AuthRequest } from '../../types/express';
import { generateClaimNumber } from './claimNumber.service';
import { assertValidTransition, canTransition, isFinalClaimStatus, statusTimestampField } from './claimWorkflow.service';
import { createAutomaticClaimTask, createClaimTask } from './claimTasks.service';
import { getDocumentChecklist } from './claimDocuments.service';
import { CreateClaimInput, UpdateClaimInput } from './claims.validation';
import { createMessage } from '../communications/communications.service';

const OPEN_STATUSES: ClaimStatus[] = [
  'REPORTED',
  'REGISTERED',
  'DOCUMENTS_PENDING',
  'DOCUMENTS_COMPLETE',
  'SUBMITTED_TO_INSURER',
  'UNDER_REVIEW',
  'ADDITIONAL_INFO_REQUESTED',
  'ASSESSED',
  'APPROVED',
  'PARTIALLY_APPROVED',
  'APPEAL',
  'SETTLEMENT_PENDING',
  'PARTIALLY_SETTLED',
];

function toDate(value?: string | null): Date | undefined {
  return value ? new Date(value) : undefined;
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function hasPermission(permissions: string[] | undefined, permission: string): boolean {
  return !!permissions?.includes(permission);
}

function requireReason(reason: string | null | undefined, label: string): string {
  const trimmed = reason?.trim();
  if (!trimmed || trimmed.length < 3) throw new Error(`${label} reason is required`);
  return trimmed;
}

function assertEditableClaim(claim: { status: ClaimStatus }, allowNotesOnly = false, data?: Record<string, unknown>) {
  if (!isFinalClaimStatus(claim.status)) return;
  if (allowNotesOnly && data && Object.keys(data).every((key) => key === 'notes')) return;
  throw new Error(`Claims in ${claim.status} status cannot be edited`);
}

async function getEditableClaim(claimId: string) {
  const claim = await prisma.claim.findFirst({ where: { id: claimId, deletedAt: null } });
  if (!claim) throw new Error('Claim not found');
  assertEditableClaim(claim);
  return claim;
}

function assertTransitionAllowed(from: ClaimStatus, to: ClaimStatus) {
  if (!canTransition(from, to)) {
    throw new Error(`Invalid claim status transition from ${from} to ${to}`);
  }
}

function claimInclude(): Prisma.ClaimInclude {
  return {
    client: { select: { id: true, clientNumber: true, firstName: true, lastName: true, companyName: true, tradingName: true, email: true, phone: true } },
    policy: { select: { id: true, policyNumber: true, status: true, startDate: true, endDate: true, totalPremium: true, outstandingAmount: true } },
    insurer: { select: { id: true, name: true, shortName: true } },
    product: { select: { id: true, name: true, code: true, category: true, insuranceClass: true } },
    owner: { select: { id: true, firstName: true, lastName: true, email: true } },
    documents: true,
    activities: { orderBy: { createdAt: 'desc' }, take: 3 },
    queries: {
      orderBy: { createdAt: 'desc' },
      take: 10,
      include: {
        responses: { orderBy: { responseDate: 'asc' }, include: { documents: true } },
        tasks: { where: { status: { not: 'CANCELLED' } }, orderBy: { dueDate: 'asc' } },
      },
    },
    settlements: { orderBy: { createdAt: 'desc' }, take: 10 },
    assessments: { orderBy: { assessmentDate: 'desc' }, take: 5 },
    tasks: { where: { status: { not: 'CANCELLED' } }, orderBy: { dueDate: 'asc' }, take: 10 },
    _count: { select: { documents: true, tasks: true, queries: true, settlements: true, activities: true } },
  };
}

export async function listClaims(req: AuthRequest) {
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(100, parseInt(req.query.limit as string) || 20);
  const skip = (page - 1) * limit;
  const {
    search,
    status,
    clientId,
    policyId,
    insurerId,
    productId,
    ownerId,
    priority,
    overdue,
    fraudFlag,
    dateFrom,
    dateTo,
  } = req.query as Record<string, string | undefined>;

  const where: Prisma.ClaimWhereInput = {
    deletedAt: null,
    ...(status && { status: status as ClaimStatus }),
    ...(clientId && { clientId }),
    ...(policyId && { policyId }),
    ...(insurerId && { insurerId }),
    ...(productId && { productId }),
    ...(ownerId && { ownerId }),
    ...(priority && { priority: priority as any }),
    ...(fraudFlag === 'true' && { fraudFlag: true }),
    ...(overdue === 'true' && {
      status: { in: OPEN_STATUSES },
      OR: [
        { submissionDueAt: { lt: new Date() } },
        { insurerFollowUpDueAt: { lt: new Date() } },
        { resolutionDueAt: { lt: new Date() } },
        { documentsDueAt: { lt: new Date() } },
      ],
    }),
  };

  if (dateFrom || dateTo) {
    where.dateReported = {
      ...(dateFrom && { gte: new Date(dateFrom) }),
      ...(dateTo && { lte: new Date(dateTo) }),
    };
  }

  if (search) {
    where.OR = [
      { claimNumber: { contains: search, mode: 'insensitive' } },
      { insurerClaimNumber: { contains: search, mode: 'insensitive' } },
      { claimantName: { contains: search, mode: 'insensitive' } },
      { client: { OR: [{ clientNumber: { contains: search, mode: 'insensitive' } }, { firstName: { contains: search, mode: 'insensitive' } }, { lastName: { contains: search, mode: 'insensitive' } }, { companyName: { contains: search, mode: 'insensitive' } }] } },
      { policy: { policyNumber: { contains: search, mode: 'insensitive' } } },
    ];
  }

  const [claims, total] = await Promise.all([
    prisma.claim.findMany({
      where,
      skip,
      take: limit,
      orderBy: [{ priority: 'desc' }, { dateReported: 'desc' }],
      include: claimInclude(),
    }),
    prisma.claim.count({ where }),
  ]);

  return { claims, total, page, limit };
}

export async function getClaimById(id: string) {
  const claim = await prisma.claim.findFirst({
    where: { id, deletedAt: null },
    include: {
      ...claimInclude(),
      activities: { orderBy: { createdAt: 'desc' } },
      statusHistories: { orderBy: { changedAt: 'desc' } },
    },
  });
  if (!claim) throw new Error('Claim not found');
  return claim;
}

export async function createClaim(data: CreateClaimInput, createdById?: string, permissions: string[] = []) {
  const policy = await prisma.policy.findFirst({
    where: { id: data.policyId, deletedAt: null },
    include: { client: true, product: true, insurer: true },
  });
  if (!policy) throw new Error('Policy not found');

  const lossDate = new Date(data.dateOfLoss);
  const eligible = policy.status === 'ACTIVE' && lossDate >= policy.startDate && lossDate <= policy.endDate;
  if (!eligible && !data.overridePolicyEligibility) {
    throw new Error('Policy is not eligible for this claim. Use authorized override with a reason.');
  }
  if (!eligible && !hasPermission(permissions, 'claims.override_policy_eligibility')) {
    throw new Error('Policy eligibility override permission is required');
  }
  if (!eligible && !data.overrideReason) {
    throw new Error('Override reason is required when policy eligibility fails');
  }

  const duplicate = await prisma.claim.findFirst({
    where: {
      deletedAt: null,
      policyId: policy.id,
      dateOfLoss: lossDate,
      lossType: { equals: data.lossType, mode: 'insensitive' },
      status: { notIn: ['VOIDED', 'WITHDRAWN'] },
    },
    select: { id: true, claimNumber: true, status: true },
  });
  if (duplicate && !data.acknowledgeDuplicateWarning) {
    throw new Error(`Potential duplicate claim detected: ${duplicate.claimNumber}. Review before registering another claim.`);
  }

  const dateReported = data.dateReported ? new Date(data.dateReported) : new Date();
  const status: ClaimStatus = 'REGISTERED';
  const claim = await prisma.$transaction(async (tx) => {
    const created = await tx.claim.create({
      data: {
        claimNumber: await generateClaimNumber(tx),
        policyId: policy.id,
        clientId: policy.clientId,
        insurerId: policy.insurerId,
        productId: policy.productId,
        claimantName: data.claimantName,
        claimantPhone: data.claimantPhone,
        claimantEmail: data.claimantEmail,
        claimantRelationship: data.claimantRelationship,
        dateOfLoss: lossDate,
        dateReported,
        lossType: data.lossType,
        lossCategory: data.lossCategory ?? policy.product.category,
        lossDescription: data.lossDescription,
        lossLocation: data.lossLocation,
        severity: data.severity ?? 'MODERATE',
        priority: data.priority ?? 'NORMAL',
        recoveryPotential: data.recoveryPotential ?? 'NONE',
        amountClaimed: data.amountClaimed,
        excess: data.excess,
        status,
        ownerId: data.ownerId ?? policy.client.relationshipManagerId ?? createdById,
        acknowledgementDueAt: addDays(dateReported, 1),
        documentsDueAt: addDays(dateReported, 7),
        submissionDueAt: addDays(dateReported, 3),
        resolutionDueAt: addDays(dateReported, 30),
        notes: data.notes,
        createdById,
      },
    });

    await tx.claimActivity.create({
      data: {
        claimId: created.id,
        type: 'CREATED',
        description: `Claim registered: ${created.claimNumber}`,
        userId: createdById,
        metadata: { overridePolicyEligibility: data.overridePolicyEligibility, overrideReason: data.overrideReason },
      },
    });

    await tx.claimStatusHistory.create({
      data: {
        claimId: created.id,
        toStatus: status,
        reason: 'Claim registration',
        changedById: createdById,
      },
    });

    return created;
  });

  const checklist = await getDocumentChecklist(claim.id);
  if (checklist.some((item) => item.isRequired && !item.satisfied)) {
    await updateClaimStatus(claim.id, 'DOCUMENTS_PENDING', 'Required claim documents are pending', createdById, false);
  } else {
    await updateClaimStatus(claim.id, 'DOCUMENTS_COMPLETE', 'Required claim documents are complete', createdById, true);
  }

  return getClaimById(claim.id);
}

export async function updateClaim(id: string, data: UpdateClaimInput, userId?: string) {
  const existing = await prisma.claim.findFirst({ where: { id, deletedAt: null } });
  if (!existing) throw new Error('Claim not found');
  assertEditableClaim(existing, true, data as Record<string, unknown>);

  const claim = await prisma.claim.update({
    where: { id },
    data,
    include: claimInclude(),
  });

  await prisma.claimActivity.create({
    data: {
      claimId: id,
      type: 'UPDATED',
      description: 'Claim details updated',
      userId,
      metadata: data as any,
    },
  });

  return claim;
}

export async function assignClaim(id: string, ownerId: string | null, userId?: string, notes?: string | null) {
  const existing = await prisma.claim.findFirst({ where: { id, deletedAt: null } });
  if (!existing) throw new Error('Claim not found');
  assertEditableClaim(existing);

  const claim = await prisma.claim.update({
    where: { id },
    data: { ownerId },
    include: claimInclude(),
  });

  await prisma.claimActivity.create({
    data: {
      claimId: id,
      type: 'ASSIGNED',
      description: ownerId ? 'Claim assigned' : 'Claim owner cleared',
      userId,
      metadata: { fromOwnerId: existing.ownerId, toOwnerId: ownerId, notes },
    },
  });

  return claim;
}

export async function updateClaimStatus(
  id: string,
  status: ClaimStatus,
  reason?: string | null,
  userId?: string,
  createFollowUpTask = true,
) {
  const existing = await prisma.claim.findFirst({ where: { id, deletedAt: null } });
  if (!existing) throw new Error('Claim not found');
  if (existing.status === status) return getClaimById(id);
  if (['WITHDRAWN', 'VOIDED'].includes(status)) requireReason(reason, status.toLowerCase());
  if (status === 'REJECTED') requireReason(reason, 'Rejection');
  if (status === 'CLOSED' && !reason?.trim()) reason = 'Claim closed';
  assertValidTransition(existing.status, status);

  const timestampField = statusTimestampField(status);
  const data: Prisma.ClaimUpdateInput = {
    status,
    ...(timestampField && { [timestampField]: new Date() }),
    ...(status === 'VOIDED' && { voidReason: reason ?? 'Voided' }),
  };

  const claim = await prisma.$transaction(async (tx) => {
    const updated = await tx.claim.update({ where: { id }, data });
    await tx.claimStatusHistory.create({
      data: {
        claimId: id,
        fromStatus: existing.status,
        toStatus: status,
        reason,
        changedById: userId,
      },
    });
    await tx.claimActivity.create({
      data: {
        claimId: id,
        type: 'STATUS_CHANGED',
        description: `Status changed from ${existing.status} to ${status}`,
        userId,
        metadata: { reason },
      },
    });
    return updated;
  });

  if (createFollowUpTask) {
    await createAutomaticClaimTask(claim, status, userId).catch(() => null);
  }

  return getClaimById(id);
}

export async function voidClaim(id: string, reason: string, userId?: string) {
  return updateClaimStatus(id, 'VOIDED', requireReason(reason, 'Void'), userId, false);
}

export async function softDeleteClaim(id: string, userId?: string) {
  const existing = await prisma.claim.findFirst({ where: { id, deletedAt: null } });
  if (!existing) throw new Error('Claim not found');
  if (!['REPORTED', 'REGISTERED'].includes(existing.status)) {
    throw new Error('Operational claims cannot be deleted. Void or close the claim instead.');
  }
  await prisma.claim.update({ where: { id }, data: { deletedAt: new Date() } });
  await prisma.claimActivity.create({
    data: { claimId: id, type: 'DELETED', description: 'Claim soft-deleted', userId },
  });
}

export async function getClaimStats() {
  const [
    total,
    open,
    settled,
    rejected,
    awaitingDocuments,
    submitted,
    settlementPending,
    highPriority,
    fraudFlagged,
    byStatus,
    byInsurer,
    byProduct,
    paid,
  ] = await Promise.all([
    prisma.claim.count({ where: { deletedAt: null } }),
    prisma.claim.count({ where: { deletedAt: null, status: { in: OPEN_STATUSES } } }),
    prisma.claim.count({ where: { deletedAt: null, status: { in: ['SETTLED', 'CLOSED'] } } }),
    prisma.claim.count({ where: { deletedAt: null, status: 'REJECTED' } }),
    prisma.claim.count({ where: { deletedAt: null, status: 'DOCUMENTS_PENDING' } }),
    prisma.claim.count({ where: { deletedAt: null, status: { in: ['SUBMITTED_TO_INSURER', 'UNDER_REVIEW'] } } }),
    prisma.claim.count({ where: { deletedAt: null, status: 'SETTLEMENT_PENDING' } }),
    prisma.claim.count({ where: { deletedAt: null, priority: { in: ['URGENT', 'VIP'] } } }),
    prisma.claim.count({ where: { deletedAt: null, fraudFlag: true } }),
    prisma.claim.groupBy({ by: ['status'], where: { deletedAt: null }, _count: { _all: true } }),
    prisma.claim.groupBy({ by: ['insurerId'], where: { deletedAt: null }, _count: { _all: true } }),
    prisma.claim.groupBy({ by: ['productId'], where: { deletedAt: null }, _count: { _all: true } }),
    prisma.claim.aggregate({ where: { deletedAt: null }, _sum: { amountClaimed: true, amountApproved: true, amountPaid: true } }),
  ]);

  const closedClaims = await prisma.claim.findMany({
    where: { deletedAt: null, closedAt: { not: null } },
    select: { dateReported: true, closedAt: true },
  });
  const averageProcessingDays = closedClaims.length
    ? closedClaims.reduce((sum, claim) => sum + Math.ceil(((claim.closedAt as Date).getTime() - claim.dateReported.getTime()) / 86400000), 0) / closedClaims.length
    : 0;

  return {
    total,
    open,
    settled,
    rejected,
    awaitingDocuments,
    submitted,
    settlementPending,
    highPriority,
    fraudFlagged,
    averageProcessingDays,
    totals: paid._sum,
    byStatus,
    byInsurer,
    byProduct,
  };
}

export async function getClaimPipeline() {
  const claims = await prisma.claim.findMany({
    where: { deletedAt: null, status: { in: OPEN_STATUSES } },
    include: claimInclude(),
    orderBy: [{ priority: 'desc' }, { dateReported: 'asc' }],
  });
  return claims.reduce<Record<string, typeof claims>>((acc, claim) => {
    acc[claim.status] = acc[claim.status] ?? [];
    acc[claim.status].push(claim);
    return acc;
  }, {});
}

export async function listClaimTimeline(id: string) {
  const claim = await prisma.claim.findUnique({ where: { id }, select: { id: true } });
  if (!claim) throw new Error('Claim not found');
  return prisma.claimActivity.findMany({
    where: { claimId: id },
    orderBy: { createdAt: 'desc' },
  });
}

export async function addClaimDocument(claimId: string, data: any, userId?: string) {
  await getEditableClaim(claimId);
  const doc = await prisma.claimDocument.create({
    data: {
      ...data,
      claimId,
      uploadedById: userId,
    },
  });
  await prisma.claimActivity.create({
    data: { claimId, type: 'DOCUMENT_UPLOADED', description: `Document uploaded: ${doc.name}`, userId, metadata: { documentId: doc.id } },
  });
  return doc;
}

export async function updateClaimDocument(claimId: string, documentId: string, data: any, userId?: string) {
  await getEditableClaim(claimId);
  const existing = await prisma.claimDocument.findFirst({ where: { id: documentId, claimId } });
  if (!existing) throw new Error('Claim document not found');
  const doc = await prisma.claimDocument.update({ where: { id: documentId }, data });
  await prisma.claimActivity.create({
    data: { claimId, type: 'DOCUMENT_UPDATED', description: `Document updated: ${doc.name}`, userId, metadata: { documentId } },
  });
  return doc;
}

export async function verifyClaimDocument(claimId: string, documentId: string, userId?: string) {
  const doc = await updateClaimDocument(claimId, documentId, { status: 'VERIFIED', verifiedById: userId, verifiedAt: new Date(), rejectionReason: null }, userId);
  const checklist = await getDocumentChecklist(claimId);
  if (checklist.every((item) => item.satisfied)) {
    const claim = await prisma.claim.findUnique({ where: { id: claimId }, select: { status: true } });
    if (claim && canTransition(claim.status, 'DOCUMENTS_COMPLETE')) {
      await updateClaimStatus(claimId, 'DOCUMENTS_COMPLETE', 'Required documents verified', userId, true);
    }
  }
  return doc;
}

export async function rejectClaimDocument(claimId: string, documentId: string, reason: string, userId?: string) {
  return updateClaimDocument(claimId, documentId, { status: 'REJECTED', rejectionReason: reason }, userId);
}

export async function createClaimQuery(claimId: string, data: any, userId?: string) {
  const claim = await getEditableClaim(claimId);
  const source = data.source ?? data.querySource ?? 'INSURER';
  const status = source === 'INSURER' ? 'CLIENT_RESPONSE_PENDING' : 'OPEN';
  const query = await prisma.$transaction(async (tx) => {
    const created = await tx.claimQuery.create({
      data: {
        source,
        querySource: source,
        queryType: data.queryType ?? 'GENERAL',
        queryText: data.queryText,
        requestedBy: data.requestedBy ?? data.raisedByName ?? data.raisedByExternalParty ?? null,
        requestedAt: toDate(data.requestedAt) ?? new Date(),
        raisedByName: data.raisedByName ?? data.requestedBy ?? null,
        raisedByUserId: data.raisedByUserId ?? null,
        raisedByExternalParty: data.raisedByExternalParty ?? null,
        dueDate: toDate(data.dueDate),
        priority: data.priority ?? 'NORMAL',
        status,
        insurerReference: data.insurerReference ?? null,
        assignedToId: data.assignedToId ?? claim.ownerId ?? null,
        claimId,
        createdById: userId,
      },
      include: {
        responses: { include: { documents: true } },
        tasks: true,
      },
    });

    await tx.claimActivity.create({
      data: {
        claimId,
        type: 'QUERY_LOGGED',
        description: `Query logged from ${source}`,
        userId,
        metadata: { queryId: created.id, queryType: created.queryType, priority: created.priority },
      },
    });

    const task = await tx.task.create({
      data: {
        title: source === 'INSURER' ? 'Collect client response for insurer query' : 'Review claim query',
        description: created.queryText,
        category: 'CLAIM_QUERY',
        dueDate: created.dueDate ?? addDays(new Date(), source === 'INSURER' ? 2 : 3),
        priority: created.priority,
        claimId,
        claimQueryId: created.id,
        clientId: claim.clientId,
        policyId: claim.policyId,
        assignedToId: created.assignedToId ?? claim.ownerId ?? userId ?? null,
        createdById: userId ?? null,
      },
    });
    await tx.taskActivity.create({
      data: {
        taskId: task.id,
        type: 'CREATED',
        description: `Claim query task created: ${task.title}`,
        createdById: userId ?? null,
        metadata: { claimId, claimQueryId: created.id },
      },
    });
    await tx.claimActivity.create({
      data: {
        claimId,
        type: 'TASK_CREATED',
        description: `Task created for query: ${task.title}`,
        userId,
        metadata: { taskId: task.id, queryId: created.id },
      },
    });
    return created;
  });

  if (source === 'INSURER') {
    if (claim.status === 'SUBMITTED_TO_INSURER') {
      await updateClaimStatus(claimId, 'UNDER_REVIEW', 'Insurer query received after submission', userId, false);
      await updateClaimStatus(claimId, 'ADDITIONAL_INFO_REQUESTED', 'Insurer query logged', userId, true);
    } else if (canTransition(claim.status, 'ADDITIONAL_INFO_REQUESTED')) {
      await updateClaimStatus(claimId, 'ADDITIONAL_INFO_REQUESTED', 'Insurer query logged', userId, true);
    } else if (claim.status !== 'ADDITIONAL_INFO_REQUESTED') {
      await createAutomaticClaimTask(claim, 'ADDITIONAL_INFO_REQUESTED', userId).catch(() => null);
    }
    await createMessage({
      channel: claim.claimantEmail ? 'EMAIL' : 'SMS',
      messageType: 'WORKFLOW_AUTOMATION',
      category: 'CLAIM_DOCUMENT_REQUEST',
      subject: claim.claimantEmail ? `Clarification needed for claim ${claim.claimNumber}` : null,
      body: claim.claimantEmail
        ? `Dear ${claim.claimantName},\n\nYour insurer has requested clarification for claim ${claim.claimNumber}: ${data.queryText}\n\nPlease share the requested information or documents so we can respond to the insurer.\n\nRegards,\nLako Insurance Agency`
        : `Claim ${claim.claimNumber}: insurer needs clarification. Please share requested info/documents with Lako.`,
      recipients: [{ recipientType: 'CLIENT', clientId: claim.clientId }],
      clientId: claim.clientId,
      policyId: claim.policyId,
      claimId,
      relatedEntityType: 'ClaimQuery',
      relatedEntityId: query.id,
      sendNow: true,
    }, userId).catch(() => null);
  }
  return query;
}

export async function respondClaimQuery(claimId: string, queryId: string, data: any, userId?: string) {
  await getEditableClaim(claimId);
  const existing = await prisma.claimQuery.findFirst({ where: { id: queryId, claimId } });
  if (!existing) throw new Error('Claim query not found');
  const response = await prisma.claimQueryResponse.create({
    data: {
      claimQueryId: queryId,
      responseSource: data.responseSource ?? 'CLIENT',
      responseText: data.responseText,
      respondedByUserId: userId ?? null,
      respondedByName: data.respondedByName ?? null,
      responseDate: toDate(data.responseDate) ?? new Date(),
      documents: data.documentIds?.length
        ? { connect: data.documentIds.map((id: string) => ({ id })) }
        : undefined,
    },
    include: { documents: true },
  });
  const query = await prisma.claimQuery.update({
    where: { id: queryId },
    data: {
      responseText: data.responseText,
      respondedAt: response.responseDate,
      status: 'RESPONDED',
    },
    include: {
      responses: { orderBy: { responseDate: 'asc' }, include: { documents: true } },
      tasks: true,
    },
  });
  await prisma.claimActivity.create({
    data: {
      claimId,
      type: 'QUERY_RESPONDED',
      description: 'Claim query response recorded',
      userId,
      metadata: { queryId, responseId: response.id, documentIds: data.documentIds ?? [] },
    },
  });
  return query;
}

export async function updateClaimQuery(claimId: string, queryId: string, data: any) {
  await getEditableClaim(claimId);
  const existing = await prisma.claimQuery.findFirst({ where: { id: queryId, claimId } });
  if (!existing) throw new Error('Claim query not found');
  return prisma.claimQuery.update({ where: { id: queryId }, data: { ...data, dueDate: toDate(data.dueDate) } });
}

export async function closeClaimQuery(claimId: string, queryId: string, userId?: string) {
  await getEditableClaim(claimId);
  const existing = await prisma.claimQuery.findFirst({ where: { id: queryId, claimId } });
  if (!existing) throw new Error('Claim query not found');
  const query = await prisma.claimQuery.update({ where: { id: queryId }, data: { status: 'CLOSED', closedAt: new Date() } });
  await prisma.claimActivity.create({
    data: { claimId, type: 'QUERY_CLOSED', description: 'Claim query closed', userId, metadata: { queryId } },
  });
  return query;
}

export async function submitClaimQueryToInsurer(claimId: string, queryId: string, userId?: string) {
  await getEditableClaim(claimId);
  const existing = await prisma.claimQuery.findFirst({ where: { id: queryId, claimId }, include: { responses: true } });
  if (!existing) throw new Error('Claim query not found');
  if (existing.responses.length === 0 && !existing.responseText) throw new Error('Record a response before submitting to insurer');
  const submittedAt = new Date();
  const query = await prisma.claimQuery.update({
    where: { id: queryId },
    data: { status: 'SUBMITTED_TO_INSURER', submittedToInsurerAt: submittedAt },
    include: { responses: { include: { documents: true }, orderBy: { responseDate: 'asc' } }, tasks: true },
  });
  await prisma.claimQueryResponse.updateMany({
    where: { claimQueryId: queryId, submittedToInsurerAt: null },
    data: { submittedToInsurerAt: submittedAt },
  });
  await prisma.claimActivity.create({
    data: { claimId, type: 'QUERY_SUBMITTED_TO_INSURER', description: 'Claim query response submitted to insurer', userId, metadata: { queryId } },
  });
  return query;
}

export async function createClaimAssessment(claimId: string, data: any, userId?: string) {
  const claim = await getEditableClaim(claimId);
  assertTransitionAllowed(claim.status, 'ASSESSED');
  const assessment = await prisma.$transaction(async (tx) => {
    const created = await tx.claimAssessment.create({
      data: {
        ...data,
        assessmentDate: new Date(data.assessmentDate),
        claimId,
        createdById: userId,
      },
    });
    await tx.claim.update({
      where: { id: claimId },
      data: { amountAssessed: data.assessedAmount, assessedAt: new Date() },
    });
    await tx.claimActivity.create({
      data: { claimId, type: 'ASSESSMENT_ADDED', description: 'Claim assessment recorded', userId, metadata: { assessmentId: created.id } },
    });
    return created;
  });
  await updateClaimStatus(claimId, 'ASSESSED', 'Assessment recorded', userId, true);
  return assessment;
}

export async function updateClaimAssessment(claimId: string, assessmentId: string, data: any) {
  await getEditableClaim(claimId);
  const existing = await prisma.claimAssessment.findFirst({ where: { id: assessmentId, claimId } });
  if (!existing) throw new Error('Claim assessment not found');
  return prisma.claimAssessment.update({ where: { id: assessmentId }, data: { ...data, assessmentDate: toDate(data.assessmentDate) } });
}

export async function approveClaim(claimId: string, amountApproved: number, userId?: string, partial = false, reason?: string) {
  const claim = await getEditableClaim(claimId);
  const nextStatus: ClaimStatus = partial ? 'PARTIALLY_APPROVED' : 'APPROVED';
  assertTransitionAllowed(claim.status, nextStatus);
  await prisma.claim.update({ where: { id: claimId }, data: { amountApproved, approvedAt: new Date() } });
  return updateClaimStatus(claimId, nextStatus, reason ?? 'Claim approved', userId, true);
}

export async function rejectClaim(claimId: string, reason: string, category?: string, userId?: string) {
  const cleanReason = requireReason(reason, 'Rejection');
  const claim = await getEditableClaim(claimId);
  assertTransitionAllowed(claim.status, 'REJECTED');
  await prisma.claim.update({ where: { id: claimId }, data: { rejectionReason: cleanReason, rejectionCategory: category, rejectedAt: new Date() } });
  return updateClaimStatus(claimId, 'REJECTED', cleanReason, userId, true);
}

async function validateSettlementAmount(claimId: string, data: any, existingSettlementId?: string) {
  const claim = await getEditableClaim(claimId);
  const approvedStatuses: ClaimStatus[] = ['APPROVED', 'PARTIALLY_APPROVED', 'SETTLEMENT_PENDING', 'PARTIALLY_SETTLED', 'SETTLED'];
  if (!approvedStatuses.includes(claim.status) && !data.allowPreApprovalSettlement) {
    throw new Error('Settlement cannot be recorded before approval');
  }
  if (!approvedStatuses.includes(claim.status)) requireReason(data.overrideReason, 'Pre-approval settlement override');

  const approved = Number(claim.amountApproved ?? 0);
  const amount = Number(data.amount ?? 0);
  if (approved > 0) {
    const aggregate = await prisma.claimSettlement.aggregate({
      where: {
        claimId,
        status: { not: 'CANCELLED' },
        ...(existingSettlementId ? { id: { not: existingSettlementId } } : {}),
      },
      _sum: { amount: true },
    });
    const total = Number(aggregate._sum.amount ?? 0) + amount;
    if (total > approved && !data.overrideApprovedAmount) {
      throw new Error('Settlement amount exceeds approved amount');
    }
    if (total > approved) requireReason(data.overrideReason, 'Settlement amount override');
  }
}

export async function createClaimSettlement(claimId: string, data: any, userId?: string) {
  await validateSettlementAmount(claimId, data);
  const settlement = await prisma.claimSettlement.create({
    data: {
      ...data,
      settlementDate: toDate(data.settlementDate),
      expectedPaymentDate: toDate(data.expectedPaymentDate),
      paymentReceivedDate: toDate(data.paymentReceivedDate),
      claimId,
      createdById: userId,
    },
  });
  await recalcClaimPaidAmount(claimId);
  await prisma.claimActivity.create({
    data: { claimId, type: 'SETTLEMENT_RECORDED', description: `Settlement recorded: ${settlement.amount}`, userId, metadata: { settlementId: settlement.id } },
  });
  const claim = await prisma.claim.findUnique({ where: { id: claimId }, select: { status: true } });
  if (claim && canTransition(claim.status, 'SETTLEMENT_PENDING')) {
    await updateClaimStatus(claimId, 'SETTLEMENT_PENDING', 'Settlement recorded', userId, true);
  }
  return settlement;
}

export async function updateClaimSettlement(claimId: string, settlementId: string, data: any, userId?: string) {
  await validateSettlementAmount(claimId, data, settlementId);
  const existing = await prisma.claimSettlement.findFirst({ where: { id: settlementId, claimId } });
  if (!existing) throw new Error('Claim settlement not found');
  const settlement = await prisma.claimSettlement.update({
    where: { id: settlementId },
    data: { ...data, settlementDate: toDate(data.settlementDate), expectedPaymentDate: toDate(data.expectedPaymentDate), paymentReceivedDate: toDate(data.paymentReceivedDate) },
  });
  await recalcClaimPaidAmount(settlement.claimId, userId);
  return settlement;
}

export async function markSettlement(claimId: string, settlementId: string, status: 'RECEIVED' | 'DISBURSED', userId?: string) {
  await getEditableClaim(claimId);
  const existing = await prisma.claimSettlement.findFirst({ where: { id: settlementId, claimId } });
  if (!existing) throw new Error('Claim settlement not found');
  const settlement = await prisma.claimSettlement.update({
    where: { id: settlementId },
    data: {
      status,
      ...(status === 'RECEIVED' ? { paymentReceivedDate: new Date() } : {}),
    },
  });
  await recalcClaimPaidAmount(claimId, userId);
  return settlement;
}

async function recalcClaimPaidAmount(claimId: string, userId?: string) {
  const [claim, aggregate] = await Promise.all([
    prisma.claim.findUnique({ where: { id: claimId }, select: { amountApproved: true, status: true } }),
    prisma.claimSettlement.aggregate({
      where: { claimId, status: { in: ['RECEIVED', 'DISBURSED', 'PARTIAL'] } },
      _sum: { amount: true },
    }),
  ]);
  const paid = Number(aggregate._sum.amount ?? 0);
  const approved = Number(claim?.amountApproved ?? 0);
  const nextStatus: ClaimStatus | null = approved > 0 && paid >= approved ? 'SETTLED' : paid > 0 ? 'PARTIALLY_SETTLED' : null;
  await prisma.claim.update({ where: { id: claimId }, data: { amountPaid: paid } });
  if (claim && nextStatus && canTransition(claim.status, nextStatus)) {
    await updateClaimStatus(claimId, nextStatus, 'Settlement payment updated', userId, true);
  }
}

export async function listEntityClaims(entity: 'client' | 'policy', id: string) {
  return prisma.claim.findMany({
    where: { deletedAt: null, ...(entity === 'client' ? { clientId: id } : { policyId: id }) },
    include: claimInclude(),
    orderBy: { dateReported: 'desc' },
  });
}

export async function createManualTask(claimId: string, data: any, userId?: string) {
  const claim = await prisma.claim.findFirst({ where: { id: claimId, deletedAt: null } });
  if (!claim) throw new Error('Claim not found');
  return createClaimTask({
    claimId,
    clientId: claim.clientId,
    policyId: claim.policyId,
    title: data.title,
    description: data.description,
    assignedToId: data.assignedToId ?? claim.ownerId,
    dueDate: toDate(data.dueDate),
    priority: data.priority ?? 'NORMAL',
    createdById: userId,
  });
}
