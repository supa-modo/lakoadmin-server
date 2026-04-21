import { prisma } from '../../config/database';

export async function listRoles() {
  return prisma.role.findMany({
    include: {
      permissions: { include: { permission: true } },
      _count: { select: { users: true } },
    },
    orderBy: { name: 'asc' },
  });
}

export async function getRoleById(id: string) {
  const role = await prisma.role.findUnique({
    where: { id },
    include: {
      permissions: { include: { permission: true } },
      _count: { select: { users: true } },
    },
  });
  if (!role) throw new Error('Role not found');
  return role;
}

export async function createRole(data: {
  name: string;
  displayName: string;
  description?: string;
  permissionIds?: string[];
}) {
  const existing = await prisma.role.findUnique({ where: { name: data.name } });
  if (existing) throw new Error('Role name already exists');

  return prisma.role.create({
    data: {
      name: data.name,
      displayName: data.displayName,
      description: data.description,
      permissions: data.permissionIds?.length
        ? { create: data.permissionIds.map((permissionId) => ({ permissionId })) }
        : undefined,
    },
    include: {
      permissions: { include: { permission: true } },
    },
  });
}

export async function updateRole(
  id: string,
  data: { displayName?: string; description?: string },
) {
  const role = await prisma.role.findUnique({ where: { id } });
  if (!role) throw new Error('Role not found');
  if (role.isSystem) throw new Error('System roles cannot be modified');

  return prisma.role.update({
    where: { id },
    data,
    include: { permissions: { include: { permission: true } } },
  });
}

export async function setRolePermissions(id: string, permissionIds: string[]) {
  const role = await prisma.role.findUnique({ where: { id } });
  if (!role) throw new Error('Role not found');

  await prisma.rolePermission.deleteMany({ where: { roleId: id } });

  if (permissionIds.length > 0) {
    await prisma.rolePermission.createMany({
      data: permissionIds.map((permissionId) => ({ roleId: id, permissionId })),
    });
  }

  return getRoleById(id);
}
