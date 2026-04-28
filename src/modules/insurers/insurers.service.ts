import { prisma } from '../../config/database';
import { CreateInsurerInput, UpdateInsurerInput, CreateContactInput, UpdateContactInput } from './insurers.validation';
import { AuthRequest } from '../../types/express';

export async function listInsurers(req: AuthRequest) {
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(100, parseInt(req.query.limit as string) || 20);
  const skip = (page - 1) * limit;
  const search = (req.query.search as string) || '';
  const status = req.query.status as string | undefined;

  const where: any = {
    deletedAt: null,
    ...(search && {
      OR: [
        { name: { contains: search, mode: 'insensitive' } },
        { shortName: { contains: search, mode: 'insensitive' } },
        { iraLicenseNumber: { contains: search, mode: 'insensitive' } },
        { registrationNumber: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ],
    }),
    ...(status && { status }),
  };

  const [insurers, total] = await Promise.all([
    prisma.insurer.findMany({
      where,
      skip,
      take: limit,
      orderBy: { name: 'asc' },
      include: {
        _count: {
          select: {
            products: { where: { deletedAt: null, status: 'ACTIVE' } },
            contacts: true,
          },
        },
      },
    }),
    prisma.insurer.count({ where }),
  ]);

  return { insurers, total, page, limit };
}

export async function getInsurerById(id: string) {
  const insurer = await prisma.insurer.findFirst({
    where: { id, deletedAt: null },
    include: {
      contacts: { orderBy: [{ isPrimary: 'desc' }, { name: 'asc' }] },
      _count: {
        select: {
          products: { where: { deletedAt: null } },
          policies: true,
          commissionRules: { where: { isActive: true } },
        },
      },
    },
  });
  if (!insurer) throw new Error('Insurer not found');
  return insurer;
}

export async function createInsurer(data: CreateInsurerInput, userId?: string) {
  const { iraClassifications, ...rest } = data;
  return prisma.insurer.create({
    data: {
      ...rest,
      logoUrl: rest.logoUrl || null,
      email: rest.email || null,
      website: rest.website || null,
      iraClassifications: (iraClassifications as any[]) || [],
      createdById: userId,
    },
  });
}

export async function updateInsurer(id: string, data: UpdateInsurerInput) {
  const insurer = await prisma.insurer.findFirst({ where: { id, deletedAt: null } });
  if (!insurer) throw new Error('Insurer not found');

  const { iraClassifications, ...rest } = data;
  return prisma.insurer.update({
    where: { id },
    data: {
      ...rest,
      ...(rest.logoUrl !== undefined && { logoUrl: rest.logoUrl || null }),
      ...(rest.email !== undefined && { email: rest.email || null }),
      ...(rest.website !== undefined && { website: rest.website || null }),
      ...(iraClassifications !== undefined && { iraClassifications: iraClassifications as any[] }),
    },
  });
}

export async function softDeleteInsurer(id: string) {
  const insurer = await prisma.insurer.findFirst({ where: { id, deletedAt: null } });
  if (!insurer) throw new Error('Insurer not found');

  const productCount = await prisma.product.count({
    where: { insurerId: id, deletedAt: null, status: 'ACTIVE' },
  });
  if (productCount > 0) {
    throw new Error('Cannot delete insurer with active products');
  }

  return prisma.insurer.update({
    where: { id },
    data: { deletedAt: new Date(), status: 'INACTIVE' },
  });
}

// Contacts
export async function listContacts(insurerId: string) {
  const insurer = await prisma.insurer.findFirst({ where: { id: insurerId, deletedAt: null } });
  if (!insurer) throw new Error('Insurer not found');
  return prisma.insurerContact.findMany({
    where: { insurerId },
    orderBy: [{ isPrimary: 'desc' }, { name: 'asc' }],
  });
}

export async function addContact(insurerId: string, data: CreateContactInput) {
  const insurer = await prisma.insurer.findFirst({ where: { id: insurerId, deletedAt: null } });
  if (!insurer) throw new Error('Insurer not found');

  if (data.isPrimary) {
    await prisma.insurerContact.updateMany({
      where: { insurerId },
      data: { isPrimary: false },
    });
  }

  return prisma.insurerContact.create({
    data: {
      insurerId,
      name: data.name,
      title: data.title,
      department: data.department,
      email: data.email || null,
      phone: data.phone,
      isPrimary: data.isPrimary ?? false,
      notes: data.notes,
    },
  });
}

export async function updateContact(insurerId: string, contactId: string, data: UpdateContactInput) {
  const contact = await prisma.insurerContact.findFirst({
    where: { id: contactId, insurerId },
  });
  if (!contact) throw new Error('Contact not found');

  if (data.isPrimary) {
    await prisma.insurerContact.updateMany({
      where: { insurerId, id: { not: contactId } },
      data: { isPrimary: false },
    });
  }

  return prisma.insurerContact.update({
    where: { id: contactId },
    data: {
      ...data,
      ...(data.email !== undefined && { email: data.email || null }),
    },
  });
}

export async function removeContact(insurerId: string, contactId: string) {
  const contact = await prisma.insurerContact.findFirst({
    where: { id: contactId, insurerId },
  });
  if (!contact) throw new Error('Contact not found');
  return prisma.insurerContact.delete({ where: { id: contactId } });
}

export async function getInsurerProducts(insurerId: string) {
  const insurer = await prisma.insurer.findFirst({ where: { id: insurerId, deletedAt: null } });
  if (!insurer) throw new Error('Insurer not found');
  return prisma.product.findMany({
    where: { insurerId, deletedAt: null },
    orderBy: [{ status: 'asc' }, { name: 'asc' }],
    include: {
      _count: { select: { policies: true } },
    },
  });
}

export async function getInsurerCommissionRules(insurerId: string) {
  const insurer = await prisma.insurer.findFirst({ where: { id: insurerId, deletedAt: null } });
  if (!insurer) throw new Error('Insurer not found');
  return prisma.commissionRule.findMany({
    where: { insurerId, productId: null },
    orderBy: { effectiveFrom: 'desc' },
    include: { product: { select: { id: true, name: true } } },
  });
}
