import { prisma } from '../../config/database';
import { CreateProductInput, UpdateProductInput, CreateVersionInput, UpdateVersionInput } from './products.validation';
import { AuthRequest } from '../../types/express';
import { Decimal } from '@prisma/client/runtime/client';

function toDecimalOrNull(v: number | null | undefined): Decimal | null {
  if (v == null) return null;
  return new Decimal(v);
}

export async function listProducts(req: AuthRequest) {
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(100, parseInt(req.query.limit as string) || 20);
  const skip = (page - 1) * limit;
  const search = (req.query.search as string) || '';
  const status = req.query.status as string | undefined;
  const insurerId = req.query.insurerId as string | undefined;
  const insuranceClass = req.query.insuranceClass as string | undefined;
  const category = req.query.category as string | undefined;

  const where: any = {
    deletedAt: null,
    ...(search && {
      OR: [
        { name: { contains: search, mode: 'insensitive' } },
        { code: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ],
    }),
    ...(status && { status }),
    ...(insurerId && { insurerId }),
    ...(insuranceClass && { insuranceClass }),
    ...(category && { category: { contains: category, mode: 'insensitive' } }),
  };

  const [products, total] = await Promise.all([
    prisma.product.findMany({
      where,
      skip,
      take: limit,
      orderBy: [{ status: 'asc' }, { name: 'asc' }],
      include: {
        insurer: { select: { id: true, name: true, shortName: true, logoUrl: true } },
        _count: {
          select: {
            policies: true,
            versions: true,
            commissionRules: { where: { isActive: true } },
          },
        },
      },
    }),
    prisma.product.count({ where }),
  ]);

  return { products, total, page, limit };
}

export async function getProductById(id: string) {
  const product = await prisma.product.findFirst({
    where: { id, deletedAt: null },
    include: {
      insurer: { select: { id: true, name: true, shortName: true, logoUrl: true, status: true } },
      versions: { orderBy: { effectiveDate: 'desc' } },
      commissionRules: {
        where: { isActive: true },
        orderBy: { effectiveFrom: 'desc' },
      },
      _count: { select: { policies: true } },
    },
  });
  if (!product) throw new Error('Product not found');
  return product;
}

export async function searchProducts(query: string, insurerId?: string) {
  return prisma.product.findMany({
    where: {
      deletedAt: null,
      status: 'ACTIVE',
      ...(query && {
        OR: [
          { name: { contains: query, mode: 'insensitive' } },
          { code: { contains: query, mode: 'insensitive' } },
        ],
      }),
      ...(insurerId && { insurerId }),
    },
    take: 20,
    select: {
      id: true,
      code: true,
      name: true,
      insuranceClass: true,
      category: true,
      insurer: { select: { id: true, name: true, shortName: true } },
      paymentOptions: true,
      policyDurations: true,
      minPremium: true,
      maxPremium: true,
    },
  });
}

export async function createProduct(data: CreateProductInput, userId?: string) {
  const existing = await prisma.product.findUnique({ where: { code: data.code } });
  if (existing) throw new Error(`Product code '${data.code}' already exists`);

  const insurer = await prisma.insurer.findFirst({ where: { id: data.insurerId, deletedAt: null } });
  if (!insurer) throw new Error('Insurer not found');

  return prisma.product.create({
    data: {
      insurerId: data.insurerId,
      code: data.code,
      name: data.name,
      insuranceClass: data.insuranceClass,
      category: data.category,
      subcategory: data.subcategory,
      description: data.description,
      eligibleClientTypes: data.eligibleClientTypes || [],
      minPremium: toDecimalOrNull(data.minPremium),
      maxPremium: toDecimalOrNull(data.maxPremium),
      minSumInsured: toDecimalOrNull(data.minSumInsured),
      maxSumInsured: toDecimalOrNull(data.maxSumInsured),
      policyDurations: data.policyDurations || [],
      paymentOptions: data.paymentOptions || [],
      coverageDetails: data.coverageDetails as any,
      ratingFactors: data.ratingFactors as any,
      benefits: data.benefits as any,
      requiredDocuments: data.requiredDocuments || [],
      brochureUrl: data.brochureUrl || null,
      status: data.status || 'ACTIVE',
      createdById: userId,
    },
    include: {
      insurer: { select: { id: true, name: true, shortName: true } },
    },
  });
}

export async function updateProduct(id: string, data: UpdateProductInput) {
  const product = await prisma.product.findFirst({ where: { id, deletedAt: null } });
  if (!product) throw new Error('Product not found');

  return prisma.product.update({
    where: { id },
    data: {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.insuranceClass !== undefined && { insuranceClass: data.insuranceClass }),
      ...(data.category !== undefined && { category: data.category }),
      ...(data.subcategory !== undefined && { subcategory: data.subcategory }),
      ...(data.description !== undefined && { description: data.description }),
      ...(data.eligibleClientTypes !== undefined && { eligibleClientTypes: data.eligibleClientTypes }),
      ...(data.minPremium !== undefined && { minPremium: toDecimalOrNull(data.minPremium) }),
      ...(data.maxPremium !== undefined && { maxPremium: toDecimalOrNull(data.maxPremium) }),
      ...(data.minSumInsured !== undefined && { minSumInsured: toDecimalOrNull(data.minSumInsured) }),
      ...(data.maxSumInsured !== undefined && { maxSumInsured: toDecimalOrNull(data.maxSumInsured) }),
      ...(data.policyDurations !== undefined && { policyDurations: data.policyDurations }),
      ...(data.paymentOptions !== undefined && { paymentOptions: data.paymentOptions }),
      ...(data.coverageDetails !== undefined && { coverageDetails: data.coverageDetails as any }),
      ...(data.ratingFactors !== undefined && { ratingFactors: data.ratingFactors as any }),
      ...(data.benefits !== undefined && { benefits: data.benefits as any }),
      ...(data.requiredDocuments !== undefined && { requiredDocuments: data.requiredDocuments }),
      ...(data.brochureUrl !== undefined && { brochureUrl: data.brochureUrl || null }),
      ...(data.status !== undefined && { status: data.status }),
    },
    include: {
      insurer: { select: { id: true, name: true, shortName: true } },
    },
  });
}

export async function softDeleteProduct(id: string) {
  const product = await prisma.product.findFirst({ where: { id, deletedAt: null } });
  if (!product) throw new Error('Product not found');

  const activePolicies = await prisma.policy.count({
    where: { productId: id, status: { in: ['ACTIVE', 'PENDING_PAYMENT', 'PENDING_UNDERWRITING'] } },
  });
  if (activePolicies > 0) {
    throw new Error('Cannot delete product with active policies');
  }

  return prisma.product.update({
    where: { id },
    data: { deletedAt: new Date(), status: 'DISCONTINUED' },
  });
}

// Versions
export async function addVersion(productId: string, data: CreateVersionInput) {
  const product = await prisma.product.findFirst({ where: { id: productId, deletedAt: null } });
  if (!product) throw new Error('Product not found');

  const existing = await prisma.productVersion.findUnique({
    where: { productId_versionNumber: { productId, versionNumber: data.versionNumber } },
  });
  if (existing) throw new Error(`Version '${data.versionNumber}' already exists for this product`);

  if (data.isActive) {
    await prisma.productVersion.updateMany({
      where: { productId },
      data: { isActive: false },
    });
  }

  return prisma.productVersion.create({
    data: {
      productId,
      versionNumber: data.versionNumber,
      effectiveDate: new Date(data.effectiveDate),
      terms: data.terms,
      exclusions: data.exclusions,
      claimsProcess: data.claimsProcess,
      documentUrl: data.documentUrl || null,
      isActive: data.isActive ?? true,
    },
  });
}

export async function updateVersion(productId: string, versionId: string, data: UpdateVersionInput) {
  const version = await prisma.productVersion.findFirst({
    where: { id: versionId, productId },
  });
  if (!version) throw new Error('Version not found');

  if (data.isActive) {
    await prisma.productVersion.updateMany({
      where: { productId, id: { not: versionId } },
      data: { isActive: false },
    });
  }

  return prisma.productVersion.update({
    where: { id: versionId },
    data: {
      ...(data.versionNumber !== undefined && { versionNumber: data.versionNumber }),
      ...(data.effectiveDate !== undefined && { effectiveDate: new Date(data.effectiveDate) }),
      ...(data.terms !== undefined && { terms: data.terms }),
      ...(data.exclusions !== undefined && { exclusions: data.exclusions }),
      ...(data.claimsProcess !== undefined && { claimsProcess: data.claimsProcess }),
      ...(data.documentUrl !== undefined && { documentUrl: data.documentUrl || null }),
      ...(data.isActive !== undefined && { isActive: data.isActive }),
    },
  });
}
