import { prisma } from '../../config/database';
import { AuthRequest } from '../../types/express';
import { OnboardingCase, OnboardingDocument, Prisma } from '@prisma/client';

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
            firstName: true,
            lastName: true,
            companyName: true,
            email: true,
            phone: true,
          },
        },
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
      clientType: data.clientType,
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
    data,
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
    },
  });

  return onboardingCase;
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
