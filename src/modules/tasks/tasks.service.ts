import { prisma } from '../../config/database';
import { AuthRequest } from '../../types/express';
import { Task, Prisma } from '@prisma/client';

const taskInclude = {
  assignedTo: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
    },
  },
  createdBy: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
    },
  },
  lead: {
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
    },
  },
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
  onboardingCase: { select: { id: true, caseNumber: true, status: true } },
  policy: { select: { id: true, policyNumber: true, status: true } },
  payment: { select: { id: true, paymentNumber: true, amount: true, status: true } },
  commissionEntry: { select: { id: true, grossCommission: true, status: true } },
  insurer: { select: { id: true, name: true, shortName: true } },
  agent: { select: { id: true, agentNumber: true, firstName: true, lastName: true, email: true, phone: true } },
} satisfies Prisma.TaskInclude;

function requireUserId(req: AuthRequest): string {
  const userId = req.user?.id;
  if (!userId) throw new Error('Authentication required');
  return userId;
}

function taskAccessWhere(userId: string): Prisma.TaskWhereInput {
  return {
    OR: [
      { createdById: userId },
      { assignedToId: userId },
    ],
  };
}

function withTaskAccess(where: Prisma.TaskWhereInput, userId: string): Prisma.TaskWhereInput {
  return { AND: [taskAccessWhere(userId), where] };
}

async function getAccessibleTask(id: string, userId: string): Promise<Task> {
  const task = await prisma.task.findFirst({
    where: withTaskAccess({ id }, userId),
  });
  if (!task) throw new Error('Task not found');
  return task;
}

function sanitizeAssignee(value: unknown): string | null | undefined {
  return value === '' ? null : value as string | null | undefined;
}

function statusActivityForChange(previousStatus: string, nextStatus: string) {
  if (nextStatus === 'COMPLETED') {
    return {
      type: 'COMPLETED',
      description: 'Task marked as completed',
    };
  }

  if (previousStatus === 'COMPLETED') {
    return {
      type: 'REOPENED',
      description: 'Task marked as incomplete',
    };
  }

  return {
    type: 'STATUS_CHANGED',
    description: `Task status changed from ${previousStatus} to ${nextStatus}`,
  };
}

async function createTaskActivity(args: {
  taskId: string;
  type: string;
  description: string;
  metadata?: any;
  createdById?: string;
}) {
  return prisma.taskActivity.create({
    data: {
      taskId: args.taskId,
      type: args.type,
      description: args.description,
      metadata: args.metadata,
      createdById: args.createdById,
    },
  });
}

interface ListTasksResult {
  tasks: Task[];
  total: number;
  page: number;
  limit: number;
}

export async function listTasks(req: AuthRequest): Promise<ListTasksResult> {
  const userId = requireUserId(req);
  const {
    page = 1,
    limit = 20,
    search,
    status,
    priority,
    assignedTo,
    entityType,
    entityId,
    overdue,
  } = req.query as {
    page?: number;
    limit?: number;
    search?: string;
    status?: string;
    priority?: string;
    assignedTo?: string;
    entityType?: string;
    entityId?: string;
    overdue?: string;
  };

  const filters: Prisma.TaskWhereInput[] = [];

  if (search) {
    filters.push({
      OR: [
        { title: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ],
    });
  }

  if (status) {
    filters.push({ status: status as any });
  }

  if (priority) {
    filters.push({ priority: priority as any });
  }

  if (assignedTo) {
    filters.push({ assignedToId: assignedTo });
  }

  if (entityType && entityId) {
    switch (entityType) {
      case 'lead':
        filters.push({ leadId: entityId });
        break;
      case 'client':
        filters.push({ clientId: entityId });
        break;
      case 'onboarding':
        filters.push({ onboardingCaseId: entityId });
        break;
      case 'policy':
        filters.push({ policyId: entityId });
        break;
      case 'claim':
        filters.push({ claimId: entityId });
        break;
      case 'payment':
        filters.push({ paymentId: entityId });
        break;
      case 'commission':
        filters.push({ commissionEntryId: entityId });
        break;
      case 'insurer':
        filters.push({ insurerId: entityId });
        break;
      case 'agent':
        filters.push({ agentId: entityId });
        break;
    }
  }

  if (overdue === 'true') {
    filters.push({
      dueDate: { lt: new Date() },
      status: { notIn: ['COMPLETED', 'CANCELLED'] },
    });
  }

  const where = withTaskAccess(filters.length ? { AND: filters } : {}, userId);

  const skip = (page - 1) * limit;

  const [tasks, total] = await Promise.all([
    prisma.task.findMany({
      where,
      include: taskInclude,
      skip,
      take: limit,
      orderBy: [
        { status: 'asc' },
        { dueDate: 'asc' },
        { priority: 'desc' },
      ],
    }),
    prisma.task.count({ where }),
  ]);

  return {
    tasks,
    total,
    page,
    limit,
  };
}

export async function getTaskById(id: string, userId: string): Promise<Task> {
  const task = await prisma.task.findFirst({
    where: withTaskAccess({ id }, userId),
    include: taskInclude,
  });
  if (!task) throw new Error('Task not found');
  return task;
}

export async function createTask(data: any, createdById?: string): Promise<Task> {
  if (data.dueDate) {
    data.dueDate = new Date(data.dueDate);
  }

  const task = await prisma.task.create({
    data: {
      ...data,
      assignedToId: sanitizeAssignee(data.assignedToId) ?? createdById ?? null,
      createdById,
    },
    include: taskInclude,
  });

  await createTaskActivity({
    taskId: task.id,
    type: 'CREATED',
    description: `Task created: ${task.title}`,
    createdById,
  });

  return task;
}

export async function updateTask(id: string, data: any, userId: string): Promise<Task> {
  const existing = await getAccessibleTask(id, userId);

  if (data.dueDate) {
    data.dueDate = new Date(data.dueDate);
  }

  const isCreator = existing.createdById === userId;
  const restrictedFields = [
    'assignedToId',
    'leadId',
    'clientId',
    'onboardingCaseId',
    'policyId',
    'claimId',
    'paymentId',
    'commissionEntryId',
    'insurerId',
    'agentId',
    'isRecurring',
    'recurrenceRule',
  ];
  const updateData = { ...data };
  if (!isCreator) {
    restrictedFields.forEach((field) => delete updateData[field]);
  }
  if (updateData.assignedToId !== undefined) {
    updateData.assignedToId = sanitizeAssignee(updateData.assignedToId);
  }
  if (updateData.status === 'COMPLETED') {
    updateData.completedAt = existing.completedAt ?? new Date();
    updateData.completedById = existing.completedById ?? userId;
  } else if (updateData.status && updateData.status !== 'COMPLETED') {
    updateData.completedAt = null;
    updateData.completedById = null;
  }

  const changedFields = Object.keys(updateData);
  const statusChanged = updateData.status && updateData.status !== existing.status;
  const activity = statusChanged
    ? statusActivityForChange(existing.status, updateData.status)
    : {
        type: 'UPDATED',
        description: `Task updated: ${existing.title}`,
      };
  const metadata = statusChanged
    ? {
        changedFields,
        previousStatus: existing.status,
        nextStatus: updateData.status,
      }
    : { changedFields };

  const task = await prisma.$transaction(async (tx) => {
    const updated = await tx.task.update({
      where: { id },
      data: updateData,
      include: taskInclude,
    });

    await tx.taskActivity.create({
      data: {
        taskId: updated.id,
        type: activity.type,
        description: activity.description,
        createdById: userId,
        metadata,
      },
    });

    return updated;
  });

  return task;
}

export async function completeTask(id: string, completedById?: string): Promise<Task> {
  if (!completedById) throw new Error('Authentication required');
  const existing = await getAccessibleTask(id, completedById);

  if (existing.status === 'COMPLETED') {
    throw new Error('Task is already completed');
  }

  const task = await prisma.$transaction(async (tx) => {
    const updated = await tx.task.update({
      where: { id },
      data: {
        status: 'COMPLETED',
        completedAt: new Date(),
        completedById,
      },
      include: taskInclude,
    });

    await tx.taskActivity.create({
      data: {
        taskId: updated.id,
        type: 'COMPLETED',
        description: 'Task marked as completed',
        createdById: completedById,
        metadata: {
          previousStatus: existing.status,
          nextStatus: 'COMPLETED',
        },
      },
    });

    return updated;
  });

  return task;
}

export async function reopenTask(id: string, reopenedById?: string): Promise<Task> {
  if (!reopenedById) throw new Error('Authentication required');
  const existing = await getAccessibleTask(id, reopenedById);

  if (existing.status !== 'COMPLETED') {
    throw new Error('Task is not completed');
  }

  const task = await prisma.$transaction(async (tx) => {
    const updated = await tx.task.update({
      where: { id },
      data: {
        status: 'IN_PROGRESS',
        completedAt: null,
        completedById: null,
      },
      include: taskInclude,
    });

    await tx.taskActivity.create({
      data: {
        taskId: updated.id,
        type: 'REOPENED',
        description: 'Task marked as incomplete',
        createdById: reopenedById,
        metadata: {
          previousStatus: existing.status,
          nextStatus: 'IN_PROGRESS',
        },
      },
    });

    return updated;
  });

  return task;
}

export async function listTaskActivities(taskId: string, userId: string) {
  await getAccessibleTask(taskId, userId);

  return prisma.taskActivity.findMany({
    where: { taskId },
    include: {
      createdBy: {
        select: { id: true, firstName: true, lastName: true, email: true },
      },
    },
    orderBy: { createdAt: 'desc' },
  });
}

export async function addTaskActivity(
  taskId: string,
  data: { type: string; description: string; metadata?: any },
  createdById?: string,
) {
  if (!createdById) throw new Error('Authentication required');
  await getAccessibleTask(taskId, createdById);

  return createTaskActivity({
    taskId,
    type: data.type,
    description: data.description,
    metadata: data.metadata,
    createdById,
  });
}

export async function deleteTask(id: string, userId: string): Promise<void> {
  const existing = await prisma.task.findUnique({
    where: { id },
  });

  if (!existing) {
    throw new Error('Task not found');
  }
  if (existing.createdById !== userId) {
    throw new Error('Only the task creator can delete this task');
  }

  await prisma.task.delete({
    where: { id },
  });
}
