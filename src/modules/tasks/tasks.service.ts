import { prisma } from '../../config/database';
import { AuthRequest } from '../../types/express';
import { Task, Prisma } from '@prisma/client';

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

  const where: Prisma.TaskWhereInput = {};

  if (search) {
    where.OR = [
      { title: { contains: search, mode: 'insensitive' } },
      { description: { contains: search, mode: 'insensitive' } },
    ];
  }

  if (status) {
    where.status = status as any;
  }

  if (priority) {
    where.priority = priority as any;
  }

  if (assignedTo) {
    where.assignedToId = assignedTo;
  }

  if (entityType && entityId) {
    switch (entityType) {
      case 'lead':
        where.leadId = entityId;
        break;
      case 'client':
        where.clientId = entityId;
        break;
      case 'policy':
        where.policyId = entityId;
        break;
      case 'claim':
        where.claimId = entityId;
        break;
    }
  }

  if (overdue === 'true') {
    where.dueDate = {
      lt: new Date(),
    };
    where.status = {
      notIn: ['COMPLETED', 'CANCELLED'],
    };
  }

  const skip = (page - 1) * limit;

  const [tasks, total] = await Promise.all([
    prisma.task.findMany({
      where,
      include: {
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
          },
        },
        lead: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
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

export async function getTaskById(id: string): Promise<Task> {
  const task = await prisma.task.findUnique({
    where: { id },
    include: {
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
        },
      },
      lead: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
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

  if (!task) {
    throw new Error('Task not found');
  }

  return task;
}

export async function createTask(data: any, createdById?: string): Promise<Task> {
  if (data.dueDate) {
    data.dueDate = new Date(data.dueDate);
  }

  const task = await prisma.task.create({
    data: {
      ...data,
      createdById,
    },
    include: {
      assignedTo: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
        },
      },
    },
  });

  await createTaskActivity({
    taskId: task.id,
    type: 'CREATED',
    description: `Task created: ${task.title}`,
    createdById,
  });

  return task;
}

export async function updateTask(id: string, data: any): Promise<Task> {
  const existing = await prisma.task.findUnique({
    where: { id },
  });

  if (!existing) {
    throw new Error('Task not found');
  }

  if (data.dueDate) {
    data.dueDate = new Date(data.dueDate);
  }

  const task = await prisma.task.update({
    where: { id },
    data,
    include: {
      assignedTo: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
        },
      },
    },
  });

  await createTaskActivity({
    taskId: task.id,
    type: 'UPDATED',
    description: `Task updated: ${task.title}`,
  });

  return task;
}

export async function completeTask(id: string, completedById?: string): Promise<Task> {
  const existing = await prisma.task.findUnique({
    where: { id },
  });

  if (!existing) {
    throw new Error('Task not found');
  }

  if (existing.status === 'COMPLETED') {
    throw new Error('Task is already completed');
  }

  const task = await prisma.task.update({
    where: { id },
    data: {
      status: 'COMPLETED',
      completedAt: new Date(),
      completedById,
    },
    include: {
      assignedTo: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
        },
      },
    },
  });

  await createTaskActivity({
    taskId: task.id,
    type: 'COMPLETED',
    description: 'Task marked as completed',
    createdById: completedById,
  });

  return task;
}

export async function reopenTask(id: string, reopenedById?: string): Promise<Task> {
  const existing = await prisma.task.findUnique({
    where: { id },
  });

  if (!existing) {
    throw new Error('Task not found');
  }

  if (existing.status !== 'COMPLETED') {
    throw new Error('Task is not completed');
  }

  const task = await prisma.task.update({
    where: { id },
    data: {
      status: 'IN_PROGRESS',
      completedAt: null,
      completedById: null,
    },
    include: {
      assignedTo: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
        },
      },
    },
  });

  await createTaskActivity({
    taskId: task.id,
    type: 'REOPENED',
    description: 'Task marked as incomplete',
    createdById: reopenedById,
  });

  return task;
}

export async function listTaskActivities(taskId: string) {
  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task) throw new Error('Task not found');

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
  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task) throw new Error('Task not found');

  return createTaskActivity({
    taskId,
    type: data.type,
    description: data.description,
    metadata: data.metadata,
    createdById,
  });
}

export async function deleteTask(id: string): Promise<void> {
  const existing = await prisma.task.findUnique({
    where: { id },
  });

  if (!existing) {
    throw new Error('Task not found');
  }

  await prisma.task.delete({
    where: { id },
  });
}
