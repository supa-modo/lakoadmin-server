import fs from 'node:fs';
import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database';
import { AuthRequest } from '../../types/express';
import { DocumentUploadFields } from './documents.validation';
import { storeUploadedDocument } from './documentStorage.service';
import { recordDocumentActivity } from './documentActivity.service';

const DOCUMENT_INCLUDE = {
  activities: { orderBy: { createdAt: 'desc' as const }, take: 20 },
  client: { select: { id: true, clientNumber: true, firstName: true, lastName: true, companyName: true, tradingName: true } },
} satisfies Prisma.DocumentInclude;

function tagsFrom(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
    } catch {
      // Comma separated tags are friendly for multipart clients.
    }
    return value.split(',').map((tag) => tag.trim()).filter(Boolean);
  }
  return [];
}

function jsonFrom(value: unknown): Prisma.InputJsonValue | undefined {
  if (!value) return undefined;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as Prisma.InputJsonValue;
    } catch {
      return { raw: value };
    }
  }
  return value as Prisma.InputJsonValue;
}

function dateFrom(value?: string | null): Date | null {
  return value ? new Date(value) : null;
}

function buildWhere(req: AuthRequest): Prisma.DocumentWhereInput {
  const q = req.query;
  return {
    deletedAt: null,
    ...(q.entityType && { entityType: String(q.entityType) }),
    ...(q.entityId && { entityId: String(q.entityId) }),
    ...(q.relatedEntityType && { relatedEntityType: String(q.relatedEntityType) }),
    ...(q.relatedEntityId && { relatedEntityId: String(q.relatedEntityId) }),
    ...(q.clientId && { clientId: String(q.clientId) }),
    ...(q.policyId && { policyId: String(q.policyId) }),
    ...(q.claimId && { claimId: String(q.claimId) }),
    ...(q.paymentId && { paymentId: String(q.paymentId) }),
    ...(q.onboardingCaseId && { onboardingCaseId: String(q.onboardingCaseId) }),
    ...(q.insurerId && { insurerId: String(q.insurerId) }),
    ...(q.status && { status: q.status as any }),
    ...(q.documentType && { documentType: String(q.documentType) }),
    ...(q.sourceModule && { sourceModule: String(q.sourceModule) }),
    ...(q.search && {
      OR: [
        { name: { contains: String(q.search), mode: 'insensitive' } },
        { title: { contains: String(q.search), mode: 'insensitive' } },
        { originalFileName: { contains: String(q.search), mode: 'insensitive' } },
        { description: { contains: String(q.search), mode: 'insensitive' } },
      ],
    }),
  };
}

export async function listDocuments(req: AuthRequest) {
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
  const skip = (page - 1) * limit;
  const where = buildWhere(req);

  const [documents, total] = await Promise.all([
    prisma.document.findMany({
      where,
      include: DOCUMENT_INCLUDE,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.document.count({ where }),
  ]);

  return { documents, total, page, limit };
}

export async function getDocument(id: string) {
  const document = await prisma.document.findFirst({
    where: { id, deletedAt: null },
    include: DOCUMENT_INCLUDE,
  });
  if (!document) throw new Error('Document not found');
  return document;
}

export async function uploadDocument(file: Express.Multer.File, input: DocumentUploadFields, userId: string) {
  const stored = await storeUploadedDocument(file, input.sourceModule ?? input.category ?? 'general');
  const type = input.documentType ?? input.type ?? 'GENERAL';
  const entityType = input.entityType ?? input.relatedEntityType ?? 'GENERAL';
  const entityId = input.entityId ?? input.relatedEntityId ?? 'GENERAL';
  const name = input.title ?? stored.originalFileName;

  const document = await prisma.document.create({
    data: {
      entityType,
      entityId,
      relatedEntityType: input.relatedEntityType ?? entityType,
      relatedEntityId: input.relatedEntityId ?? entityId,
      clientId: input.clientId ?? null,
      policyId: input.policyId ?? null,
      claimId: input.claimId ?? null,
      paymentId: input.paymentId ?? null,
      onboardingCaseId: input.onboardingCaseId ?? null,
      expenseId: input.expenseId ?? null,
      insurerId: input.insurerId ?? null,
      type,
      title: input.title ?? name,
      documentType: input.documentType ?? type,
      category: input.category ?? null,
      name,
      description: input.description ?? null,
      fileName: stored.fileName,
      originalFileName: stored.originalFileName,
      fileUrl: stored.fileUrl,
      storageKey: stored.storageKey,
      checksum: stored.checksum,
      fileSize: stored.fileSize,
      mimeType: stored.mimeType,
      status: 'UPLOADED',
      visibility: input.visibility,
      sourceModule: input.sourceModule ?? null,
      version: 1,
      parentDocumentId: input.parentDocumentId ?? null,
      expiryDate: dateFrom(input.expiryDate),
      isVerified: false,
      uploadedById: userId,
      tags: tagsFrom(input.tags),
      metadata: jsonFrom(input.metadata),
      isConfidential: input.visibility === 'INTERNAL',
      createdById: userId,
    },
  });

  await recordDocumentActivity(document.id, 'UPLOADED', userId, `Uploaded ${stored.originalFileName}`, {
    entityType,
    entityId,
    storageKey: stored.storageKey,
  });
  return getDocument(document.id);
}

export async function updateDocument(id: string, input: Record<string, any>, userId: string) {
  const before = await getDocument(id);
  const document = await prisma.document.update({
    where: { id },
    data: {
      ...(input.title !== undefined && { title: input.title }),
      ...(input.name !== undefined && { name: input.name }),
      ...(input.description !== undefined && { description: input.description }),
      ...(input.documentType !== undefined && { documentType: input.documentType, type: input.documentType }),
      ...(input.category !== undefined && { category: input.category }),
      ...(input.visibility !== undefined && { visibility: input.visibility, isConfidential: input.visibility === 'INTERNAL' }),
      ...(input.status !== undefined && { status: input.status }),
      ...(input.relatedEntityType !== undefined && { relatedEntityType: input.relatedEntityType }),
      ...(input.relatedEntityId !== undefined && { relatedEntityId: input.relatedEntityId }),
      ...(input.entityType !== undefined && { entityType: input.entityType }),
      ...(input.entityId !== undefined && { entityId: input.entityId }),
      ...(input.clientId !== undefined && { clientId: input.clientId }),
      ...(input.policyId !== undefined && { policyId: input.policyId }),
      ...(input.claimId !== undefined && { claimId: input.claimId }),
      ...(input.paymentId !== undefined && { paymentId: input.paymentId }),
      ...(input.onboardingCaseId !== undefined && { onboardingCaseId: input.onboardingCaseId }),
      ...(input.expenseId !== undefined && { expenseId: input.expenseId }),
      ...(input.insurerId !== undefined && { insurerId: input.insurerId }),
      ...(input.expiryDate !== undefined && { expiryDate: dateFrom(input.expiryDate) }),
      ...(input.tags !== undefined && { tags: tagsFrom(input.tags) }),
      ...(input.metadata !== undefined && { metadata: jsonFrom(input.metadata) }),
    },
  });
  await recordDocumentActivity(id, 'UPDATED', userId, 'Document metadata updated', {
    beforeStatus: before.status,
    afterStatus: document.status,
  });
  return getDocument(id);
}

export async function verifyDocument(id: string, userId: string, notes?: string | null) {
  const document = await prisma.document.update({
    where: { id },
    data: {
      status: 'VERIFIED',
      isVerified: true,
      verifiedById: userId,
      verifiedAt: new Date(),
      rejectedById: null,
      rejectedAt: null,
      rejectionReason: null,
    },
  });
  await recordDocumentActivity(id, 'VERIFIED', userId, notes ?? 'Document verified');
  return getDocument(document.id);
}

export async function rejectDocument(id: string, reason: string, userId: string, notes?: string | null) {
  const document = await prisma.document.update({
    where: { id },
    data: {
      status: 'REJECTED',
      isVerified: false,
      rejectedById: userId,
      rejectedAt: new Date(),
      rejectionReason: reason,
    },
  });
  await recordDocumentActivity(id, 'REJECTED', userId, notes ?? reason, { reason });
  return getDocument(document.id);
}

export async function archiveDocument(id: string, userId: string) {
  const document = await prisma.document.update({
    where: { id },
    data: { status: 'ARCHIVED', deletedAt: new Date() },
  });
  await recordDocumentActivity(id, 'ARCHIVED', userId, 'Document archived');
  return document;
}

export async function getEntityDocuments(entityType: string, entityId: string) {
  return prisma.document.findMany({
    where: {
      deletedAt: null,
      OR: [
        { entityType, entityId },
        { relatedEntityType: entityType, relatedEntityId: entityId },
      ],
    },
    include: DOCUMENT_INCLUDE,
    orderBy: { createdAt: 'desc' },
  });
}

export async function getDocumentFile(id: string) {
  const document = await getDocument(id);
  if (/^https?:\/\//i.test(document.fileUrl)) return { document, redirectUrl: document.fileUrl, path: null };
  if (!fs.existsSync(document.fileUrl)) throw new Error('Document file not found');
  return { document, redirectUrl: null, path: document.fileUrl };
}
