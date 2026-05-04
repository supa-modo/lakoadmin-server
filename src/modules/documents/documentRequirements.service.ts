import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database';
import { AuthRequest } from '../../types/express';
import { DocumentRequirementInput } from './documents.validation';

export async function listDocumentRequirements(req: AuthRequest) {
  const where: Prisma.DocumentRequirementWhereInput = {};
  const { module, entityType, productId, insuranceClass, clientType, claimType, isActive } = req.query;
  if (module) where.module = String(module);
  if (entityType) where.entityType = String(entityType);
  if (productId) where.productId = String(productId);
  if (insuranceClass) where.insuranceClass = insuranceClass as any;
  if (clientType) where.clientType = clientType as any;
  if (claimType) where.claimType = String(claimType);
  if (isActive !== undefined) where.isActive = String(isActive).toLowerCase() !== 'false';

  return prisma.documentRequirement.findMany({
    where,
    orderBy: [{ module: 'asc' }, { entityType: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
  });
}

export async function createDocumentRequirement(data: DocumentRequirementInput) {
  return prisma.documentRequirement.create({
    data: {
      module: data.module,
      entityType: data.entityType,
      productId: data.productId ?? null,
      insuranceClass: data.insuranceClass as any,
      clientType: data.clientType as any,
      claimType: data.claimType ?? null,
      documentType: data.documentType,
      name: data.name,
      description: data.description ?? null,
      isRequired: data.isRequired,
      isActive: data.isActive,
      sortOrder: data.sortOrder,
    },
  });
}

export async function updateDocumentRequirement(id: string, data: Partial<DocumentRequirementInput>) {
  return prisma.documentRequirement.update({
    where: { id },
    data: {
      ...(data.module !== undefined && { module: data.module }),
      ...(data.entityType !== undefined && { entityType: data.entityType }),
      ...(data.productId !== undefined && { productId: data.productId ?? null }),
      ...(data.insuranceClass !== undefined && { insuranceClass: data.insuranceClass as any }),
      ...(data.clientType !== undefined && { clientType: data.clientType as any }),
      ...(data.claimType !== undefined && { claimType: data.claimType ?? null }),
      ...(data.documentType !== undefined && { documentType: data.documentType }),
      ...(data.name !== undefined && { name: data.name }),
      ...(data.description !== undefined && { description: data.description ?? null }),
      ...(data.isRequired !== undefined && { isRequired: data.isRequired }),
      ...(data.isActive !== undefined && { isActive: data.isActive }),
      ...(data.sortOrder !== undefined && { sortOrder: data.sortOrder }),
    },
  });
}
