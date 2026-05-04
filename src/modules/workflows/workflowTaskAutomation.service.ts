import { Prisma } from '@prisma/client';

type Tx = Prisma.TransactionClient;

type WorkflowTaskInput = {
  title: string;
  description?: string | null;
  category: string;
  dueDate?: Date | null;
  priority?: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
  leadId?: string | null;
  clientId?: string | null;
  onboardingCaseId?: string | null;
  policyId?: string | null;
  paymentId?: string | null;
  commissionEntryId?: string | null;
  insurerId?: string | null;
  agentId?: string | null;
  assignedToId?: string | null;
  createdById?: string | null;
  dedupeBy?: Array<
    | 'title'
    | 'category'
    | 'leadId'
    | 'clientId'
    | 'onboardingCaseId'
    | 'policyId'
    | 'paymentId'
    | 'commissionEntryId'
    | 'insurerId'
    | 'agentId'
  >;
};

export async function ensureWorkflowTask(tx: Tx, input: WorkflowTaskInput) {
  const defaultDedupeFields = [
    'title',
    'category',
    'leadId',
    'clientId',
    'onboardingCaseId',
    'policyId',
    'paymentId',
    'commissionEntryId',
    'insurerId',
    'agentId',
  ] as const;
  const dedupeFields = input.dedupeBy?.length ? input.dedupeBy : [...defaultDedupeFields];
  const identity: Record<string, string | null | undefined> = {
    title: input.title,
    category: input.category,
    leadId: input.leadId ?? null,
    clientId: input.clientId ?? null,
    onboardingCaseId: input.onboardingCaseId ?? null,
    policyId: input.policyId ?? null,
    paymentId: input.paymentId ?? null,
    commissionEntryId: input.commissionEntryId ?? null,
    insurerId: input.insurerId ?? null,
    agentId: input.agentId ?? null,
  };

  const existing = await tx.task.findFirst({
    where: {
      ...Object.fromEntries(dedupeFields.map((field) => [field, identity[field]])),
      status: { notIn: ['COMPLETED', 'CANCELLED'] },
    },
    select: { id: true },
  });
  if (existing) {
    return tx.task.update({
      where: { id: existing.id },
      data: {
        description: input.description ?? null,
        dueDate: input.dueDate ?? null,
        priority: input.priority ?? 'NORMAL',
        leadId: input.leadId ?? null,
        clientId: input.clientId ?? null,
        onboardingCaseId: input.onboardingCaseId ?? null,
        policyId: input.policyId ?? null,
        paymentId: input.paymentId ?? null,
        commissionEntryId: input.commissionEntryId ?? null,
        insurerId: input.insurerId ?? null,
        agentId: input.agentId ?? null,
        assignedToId: input.assignedToId ?? null,
        createdById: input.createdById ?? null,
      },
      select: { id: true },
    });
  }

  return tx.task.create({
    data: {
      title: input.title,
      description: input.description ?? null,
      category: input.category,
      dueDate: input.dueDate ?? null,
      priority: input.priority ?? 'NORMAL',
      leadId: input.leadId ?? null,
      clientId: input.clientId ?? null,
      onboardingCaseId: input.onboardingCaseId ?? null,
      policyId: input.policyId ?? null,
      paymentId: input.paymentId ?? null,
      commissionEntryId: input.commissionEntryId ?? null,
      insurerId: input.insurerId ?? null,
      agentId: input.agentId ?? null,
      assignedToId: input.assignedToId ?? null,
      createdById: input.createdById ?? null,
    },
    select: { id: true },
  });
}
