import { ClaimPriority, ClaimStatus, TaskPriority } from '@prisma/client';
import { prisma } from '../../config/database';

function addDays(days: number): Date {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date;
}

function priorityForClaim(priority: ClaimPriority): TaskPriority {
  if (priority === 'VIP' || priority === 'URGENT') return 'URGENT';
  return 'NORMAL';
}

export async function createClaimTask(args: {
  claimId: string;
  clientId: string;
  policyId: string;
  title: string;
  description?: string | null;
  assignedToId?: string | null;
  createdById?: string | null;
  dueDate?: Date | null;
  priority?: TaskPriority;
}) {
  const task = await prisma.task.create({
    data: {
      title: args.title,
      description: args.description,
      category: 'CLAIM',
      claimId: args.claimId,
      clientId: args.clientId,
      policyId: args.policyId,
      assignedToId: args.assignedToId ?? undefined,
      createdById: args.createdById ?? undefined,
      dueDate: args.dueDate ?? undefined,
      priority: args.priority ?? 'NORMAL',
    },
  });

  await prisma.taskActivity.create({
    data: {
      taskId: task.id,
      type: 'CREATED',
      description: `Claim task created: ${task.title}`,
      createdById: args.createdById ?? undefined,
      metadata: { claimId: args.claimId },
    },
  });

  await prisma.claimActivity.create({
    data: {
      claimId: args.claimId,
      type: 'TASK_CREATED',
      description: `Task created: ${task.title}`,
      userId: args.createdById ?? undefined,
      metadata: { taskId: task.id, dueDate: args.dueDate?.toISOString() },
    },
  });

  return task;
}

export async function createAutomaticClaimTask(claim: {
  id: string;
  clientId: string;
  policyId: string;
  ownerId?: string | null;
  priority: ClaimPriority;
}, status: ClaimStatus, createdById?: string | null) {
  const base = {
    claimId: claim.id,
    clientId: claim.clientId,
    policyId: claim.policyId,
    assignedToId: claim.ownerId ?? createdById ?? null,
    createdById,
    priority: priorityForClaim(claim.priority),
  };

  const taskByStatus: Partial<Record<ClaimStatus, { title: string; description: string; dueInDays: number }>> = {
    DOCUMENTS_PENDING: {
      title: 'Follow up on missing claim documents',
      description: 'Collect and verify outstanding claim requirements before insurer submission.',
      dueInDays: 2,
    },
    DOCUMENTS_COMPLETE: {
      title: 'Submit claim to insurer',
      description: 'Documents are complete. Submit the claim package to the insurer.',
      dueInDays: 1,
    },
    SUBMITTED_TO_INSURER: {
      title: 'Follow up with insurer on claim status',
      description: 'Confirm acknowledgement and request the next claim update from the insurer.',
      dueInDays: 5,
    },
    ADDITIONAL_INFO_REQUESTED: {
      title: 'Respond to insurer query',
      description: 'Coordinate response to the open insurer/client/internal query.',
      dueInDays: 2,
    },
    SETTLEMENT_PENDING: {
      title: 'Follow up on claim settlement payment',
      description: 'Track insurer settlement payment and expected receipt/disbursement.',
      dueInDays: 3,
    },
    SETTLED: {
      title: 'Confirm settlement and close claim',
      description: 'Verify settlement completion and close the operational claim file.',
      dueInDays: 2,
    },
    REJECTED: {
      title: 'Review rejected claim for appeal',
      description: 'Review rejection reason with the client and determine whether to appeal.',
      dueInDays: 3,
    },
  };

  const template = taskByStatus[status];
  if (!template) return null;

  return createClaimTask({
    ...base,
    title: template.title,
    description: template.description,
    dueDate: addDays(template.dueInDays),
  });
}
