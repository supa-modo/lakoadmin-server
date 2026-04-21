import { prisma } from '../../config/database';
import { hashPassword } from '../../utils/password';
import { invalidateUserCache } from '../../middleware/auth';
import { getPaginationParams } from '../../utils/pagination';
import { Request } from 'express';

const USER_SELECT = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  phone: true,
  avatarUrl: true,
  isActive: true,
  lastLoginAt: true,
  createdAt: true,
  updatedAt: true,
  roles: {
    select: {
      role: {
        select: { id: true, name: true, displayName: true },
      },
      assignedAt: true,
    },
  },
};

export async function listUsers(req: Request) {
  const { page, limit, skip } = getPaginationParams(req);
  const { search, roleId, isActive } = req.query as Record<string, string>;

  const where: Record<string, unknown> = { deletedAt: null };

  if (search) {
    where.OR = [
      { email: { contains: search, mode: 'insensitive' } },
      { firstName: { contains: search, mode: 'insensitive' } },
      { lastName: { contains: search, mode: 'insensitive' } },
    ];
  }

  if (isActive !== undefined) {
    where.isActive = isActive === 'true';
  }

  if (roleId) {
    where.roles = { some: { roleId } };
  }

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where: where as any,
      select: USER_SELECT,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.user.count({ where: where as any }),
  ]);

  return { users, total, page, limit };
}

export async function getUserById(id: string) {
  const user = await prisma.user.findUnique({
    where: { id, deletedAt: null },
    select: {
      ...USER_SELECT,
      failedLogins: true,
      lockedUntil: true,
      lastLoginIp: true,
      passwordChangedAt: true,
    },
  });

  if (!user) throw new Error('User not found');
  return user;
}

export async function createUser(data: {
  email: string;
  firstName: string;
  lastName: string;
  phone?: string;
  password: string;
  roleIds?: string[];
  createdById?: string;
}) {
  const existing = await prisma.user.findUnique({ where: { email: data.email.toLowerCase() } });
  if (existing) throw new Error('Email already in use');

  const hashed = await hashPassword(data.password);

  const user = await prisma.user.create({
    data: {
      email: data.email.toLowerCase().trim(),
      firstName: data.firstName,
      lastName: data.lastName,
      phone: data.phone,
      password: hashed,
      roles: data.roleIds?.length
        ? {
            create: data.roleIds.map((roleId) => ({
              roleId,
              assignedBy: data.createdById,
            })),
          }
        : undefined,
    },
    select: USER_SELECT,
  });

  return user;
}

export async function updateUser(
  id: string,
  data: { firstName?: string; lastName?: string; phone?: string | null; isActive?: boolean },
) {
  const user = await prisma.user.findUnique({ where: { id, deletedAt: null } });
  if (!user) throw new Error('User not found');

  const updated = await prisma.user.update({
    where: { id },
    data,
    select: USER_SELECT,
  });

  if (data.isActive === false) {
    await invalidateUserCache(id);
  }

  return updated;
}

export async function softDeleteUser(id: string) {
  const user = await prisma.user.findUnique({ where: { id, deletedAt: null } });
  if (!user) throw new Error('User not found');

  await prisma.user.update({
    where: { id },
    data: { deletedAt: new Date(), isActive: false, refreshTokens: [] },
  });

  await invalidateUserCache(id);
}

export async function assignRoles(
  userId: string,
  roleIds: string[],
  assignedBy?: string,
) {
  const user = await prisma.user.findUnique({ where: { id: userId, deletedAt: null } });
  if (!user) throw new Error('User not found');

  // Delete existing roles, then assign new ones
  await prisma.userRole.deleteMany({ where: { userId } });

  if (roleIds.length > 0) {
    await prisma.userRole.createMany({
      data: roleIds.map((roleId) => ({ userId, roleId, assignedBy })),
    });
  }

  await invalidateUserCache(userId);

  return getUserById(userId);
}
