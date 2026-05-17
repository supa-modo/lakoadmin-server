import { prisma } from '../../config/database';
import { AuthRequest } from '../../types/express';
import { Lead, LeadStatus, Prisma } from '@prisma/client';

interface ListLeadsResult {
  leads: Lead[];
  total: number;
  page: number;
  limit: number;
}

interface GroupedLeadsResult {
  [key: string]: Lead[];
}

export async function listLeads(req: AuthRequest): Promise<ListLeadsResult | GroupedLeadsResult> {
  const query = req.query as {
    page?: string | number;
    limit?: string | number;
    search?: string;
    status?: LeadStatus;
    priority?: string;
    assignedTo?: string;
    groupByStatus?: string;
  };

  const page = typeof query.page === 'string' ? parseInt(query.page, 10) : (query.page || 1);
  const limit = typeof query.limit === 'string' ? parseInt(query.limit, 10) : (query.limit || 20);
  const { search, status, priority, assignedTo, groupByStatus } = query;

  const where: Prisma.LeadWhereInput = {
    deletedAt: null,
  };

  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { email: { contains: search, mode: 'insensitive' } },
      { phone: { contains: search, mode: 'insensitive' } },
      { companyName: { contains: search, mode: 'insensitive' } },
    ];
  }

  if (status) {
    where.status = status;
  }

  if (priority) {
    where.priority = priority as any;
  }

  if (assignedTo) {
    where.assignedToId = assignedTo;
  }

  if (groupByStatus === 'true') {
    const leads = await prisma.lead.findMany({
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
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    const grouped: GroupedLeadsResult = {
      NEW: [],
      CONTACTED: [],
      QUALIFIED: [],
      PROPOSAL_SENT: [],
      NEGOTIATING: [],
      WON: [],
      LOST: [],
      DORMANT: [],
    };

    leads.forEach((lead) => {
      grouped[lead.status].push(lead);
    });

    return grouped;
  }

  const skip = (page - 1) * limit;

  const [leads, total] = await Promise.all([
    prisma.lead.findMany({
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
      },
      skip,
      take: limit,
      orderBy: {
        createdAt: 'desc',
      },
    }),
    prisma.lead.count({ where }),
  ]);

  return {
    leads,
    total,
    page,
    limit,
  };
}

export async function getLeadById(id: string): Promise<Lead> {
  const lead = await prisma.lead.findUnique({
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
      activities: {
        orderBy: {
          createdAt: 'desc',
        },
        take: 50,
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
        },
      },
      tasks: {
        where: {
          status: {
            not: 'CANCELLED',
          },
        },
        orderBy: {
          dueDate: 'asc',
        },
      },
      dependents: {
        where: { deletedAt: null },
        orderBy: { createdAt: 'asc' },
      },
      communications: {
        orderBy: { occurredAt: 'desc' },
        take: 50,
        include: {
          createdBy: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      },
    },
  });

  if (!lead || lead.deletedAt) {
    throw new Error('Lead not found');
  }

  return lead;
}

export async function createLead(data: any, createdById?: string): Promise<Lead> {
  if (data.email) {
    const existing = await prisma.lead.findFirst({
      where: {
        email: data.email,
        deletedAt: null,
      },
    });

    if (existing) {
      throw new Error('A lead with this email already exists');
    }
  }

  if (data.nextFollowUp) {
    data.nextFollowUp = new Date(data.nextFollowUp);
  }

  const lead = await prisma.lead.create({
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

  return lead;
}

export async function updateLead(id: string, data: any): Promise<Lead> {
  const existing = await prisma.lead.findUnique({
    where: { id },
  });

  if (!existing || existing.deletedAt) {
    throw new Error('Lead not found');
  }

  if (data.nextFollowUp) {
    data.nextFollowUp = new Date(data.nextFollowUp);
  }

  const lead = await prisma.lead.update({
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

  return lead;
}

export async function softDeleteLead(id: string): Promise<void> {
  const existing = await prisma.lead.findUnique({
    where: { id },
  });

  if (!existing || existing.deletedAt) {
    throw new Error('Lead not found');
  }

  await prisma.lead.update({
    where: { id },
    data: {
      deletedAt: new Date(),
    },
  });
}

export async function assignLead(
  id: string,
  assignedToId: string,
  assignedBy?: string
): Promise<Lead> {
  const existing = await prisma.lead.findUnique({
    where: { id },
  });

  if (!existing || existing.deletedAt) {
    throw new Error('Lead not found');
  }

  const user = await prisma.user.findUnique({
    where: { id: assignedToId },
  });

  if (!user || user.deletedAt) {
    throw new Error('User not found');
  }

  const lead = await prisma.lead.update({
    where: { id },
    data: {
      assignedToId,
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

  await prisma.leadActivity.create({
    data: {
      leadId: id,
      type: 'ASSIGNMENT',
      description: `Lead assigned to ${user.firstName} ${user.lastName}`,
      userId: assignedBy,
      metadata: {
        assignedToId,
        assignedToName: `${user.firstName} ${user.lastName}`,
      },
    },
  });

  return lead;
}

export async function updateLeadStatus(
  id: string,
  status: LeadStatus,
  lostReason?: string,
  userId?: string
): Promise<Lead> {
  const existing = await prisma.lead.findUnique({
    where: { id },
  });

  if (!existing || existing.deletedAt) {
    throw new Error('Lead not found');
  }

  const updateData: any = {
    status,
  };

  if (status === 'LOST') {
    updateData.lostAt = new Date();
    if (lostReason) {
      updateData.lostReason = lostReason;
    }
  }

  const lead = await prisma.lead.update({
    where: { id },
    data: updateData,
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

  await prisma.leadActivity.create({
    data: {
      leadId: id,
      type: 'STATUS_CHANGE',
      description: `Lead status changed to ${status}`,
      userId,
      metadata: {
        oldStatus: existing.status,
        newStatus: status,
        lostReason,
      },
    },
  });

  return lead;
}

export async function convertLeadToClient(
  id: string,
  data: {
    clientType?: string;
    relationshipManagerId?: string;
    dependents?: Array<{
      firstName: string;
      lastName?: string | null;
      dateOfBirth?: string | null;
      gender?: string | null;
      relationship: string;
      nationalId?: string | null;
      passportNumber?: string | null;
      notes?: string | null;
    }>;
    createPolicy?: boolean;
    policy?: {
      productId: string;
      insurerId: string;
      startDate: string;
      endDate: string;
      basePremium: number;
      sumInsured?: number | null;
      coverType?: string | null;
      premiumCollectionMode?: string;
    } | null;
  },
  userId?: string
): Promise<any> {
  return prisma.$transaction(async (tx) => {
    const lead = await tx.lead.findUnique({
      where: { id },
      include: {
        dependents: { where: { deletedAt: null } },
      },
    });

    if (!lead || lead.deletedAt) {
      throw new Error('Lead not found');
    }

    if (lead.convertedToClientId) {
      throw new Error('Lead has already been converted to a client');
    }

    const clientNumber = await generateClientNumber();

    // Create client
    const client = await tx.client.create({
      data: {
        clientNumber,
        type: (data.clientType as any) || lead.leadType,
        firstName: lead.leadType === 'INDIVIDUAL' ? lead.name.split(' ')[0] : null,
        lastName: lead.leadType === 'INDIVIDUAL' ? lead.name.split(' ').slice(1).join(' ') : null,
        companyName: lead.leadType !== 'INDIVIDUAL' ? lead.companyName || lead.name : null,
        email: lead.email,
        phone: lead.phone,
        relationshipManagerId: data.relationshipManagerId,
        createdById: userId,
      },
    });

    // Create dependents from payload or copy from lead
    const createdDependents = [];
    if (data.dependents && data.dependents.length > 0) {
      for (const dependent of data.dependents) {
        const created = await tx.clientDependent.create({
          data: {
            clientId: client.id,
            firstName: dependent.firstName,
            lastName: dependent.lastName ?? null,
            dateOfBirth: dependent.dateOfBirth ? new Date(dependent.dateOfBirth) : null,
            gender: dependent.gender ?? null,
            relationship: dependent.relationship,
            nationalId: dependent.nationalId ?? null,
            passportNumber: dependent.passportNumber ?? null,
            notes: dependent.notes ?? null,
          },
        });
        createdDependents.push(created);
      }
    } else if (lead.dependents?.length) {
      createdDependents.push(...(await copyLeadDependentsToClient(tx, id, client.id)));
    }

    // Update lead status
    await tx.lead.update({
      where: { id },
      data: {
        convertedToClientId: client.id,
        convertedAt: new Date(),
        status: 'WON',
      },
    });

    // Log activity
    await tx.leadActivity.create({
      data: {
        leadId: id,
        type: 'CONVERSION',
        description: `Lead converted to client ${client.clientNumber}${createdDependents.length > 0 ? ` with ${createdDependents.length} dependent(s)` : ''}`,
        userId,
        metadata: {
          clientId: client.id,
          clientNumber: client.clientNumber,
          dependentsCreated: createdDependents.length,
        },
      },
    });

    // Optionally create policy
    let policy = null;
    let commissionQuote = null;
    if (data.createPolicy && data.policy) {
      // Import policy service
      const { createPolicy: createPolicyFn } = await import('../policies/policies.service');
      
      policy = await createPolicyFn({
        clientId: client.id,
        productId: data.policy.productId,
        insurerId: data.policy.insurerId,
        startDate: data.policy.startDate,
        endDate: data.policy.endDate,
        basePremium: data.policy.basePremium,
        sumInsured: data.policy.sumInsured,
        coverType: data.policy.coverType,
        premiumCollectionMode: data.policy.premiumCollectionMode || 'BROKER_COLLECTED',
        sourceLeadId: id,
      } as any, userId || '');

      // Commission quote will be automatically created by policy creation
      commissionQuote = await tx.commissionQuote.findFirst({
        where: { policyId: policy.id },
      });
    }

    return { 
      lead, 
      client, 
      dependents: createdDependents,
      policy,
      commissionQuote,
    };
  });
}

export async function logLeadActivity(
  leadId: string,
  type: string,
  description: string,
  metadata?: any,
  userId?: string
): Promise<void> {
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
  });

  if (!lead || lead.deletedAt) {
    throw new Error('Lead not found');
  }

  await prisma.leadActivity.create({
    data: {
      leadId,
      type,
      description,
      metadata,
      userId,
    },
  });
}

async function generateClientNumber(): Promise<string> {
  const lastClient = await prisma.client.findFirst({
    orderBy: { createdAt: 'desc' },
    select: { clientNumber: true },
  });

  if (!lastClient) {
    return 'CL-000001';
  }

  const lastNumber = parseInt(lastClient.clientNumber.split('-')[1]);
  const nextNumber = lastNumber + 1;
  return `CL-${nextNumber.toString().padStart(6, '0')}`;
}

export async function checkDuplicateLead(email?: string, phone?: string): Promise<Lead | null> {
  if (!email && !phone) {
    return null;
  }

  const where: Prisma.LeadWhereInput = {
    deletedAt: null,
    OR: [],
  };

  if (email) {
    where.OR?.push({ email });
  }

  if (phone) {
    where.OR?.push({ phone });
  }

  const duplicate = await prisma.lead.findFirst({
    where,
  });

  return duplicate;
}

async function assertLeadEditable(leadId: string) {
  const lead = await prisma.lead.findFirst({ where: { id: leadId, deletedAt: null } });
  if (!lead) throw new Error('Lead not found');
  return lead;
}

export async function createLeadDependent(leadId: string, data: Record<string, unknown>) {
  await assertLeadEditable(leadId);
  return prisma.leadDependent.create({
    data: {
      leadId,
      firstName: String(data.firstName),
      lastName: (data.lastName as string | null | undefined) ?? null,
      dateOfBirth: data.dateOfBirth ? new Date(String(data.dateOfBirth)) : null,
      gender: (data.gender as string | null | undefined) ?? null,
      relationship: String(data.relationship),
      nationalId: (data.nationalId as string | null | undefined) ?? null,
      passportNumber: (data.passportNumber as string | null | undefined) ?? null,
      notes: (data.notes as string | null | undefined) ?? null,
    },
  });
}

export async function updateLeadDependent(
  leadId: string,
  dependentId: string,
  data: Record<string, unknown>,
) {
  await assertLeadEditable(leadId);
  const existing = await prisma.leadDependent.findFirst({
    where: { id: dependentId, leadId, deletedAt: null },
  });
  if (!existing) throw new Error('Dependent not found');

  return prisma.leadDependent.update({
    where: { id: dependentId },
    data: {
      ...(data.firstName !== undefined && { firstName: String(data.firstName) }),
      ...(data.lastName !== undefined && { lastName: (data.lastName as string | null) ?? null }),
      ...(data.dateOfBirth !== undefined && {
        dateOfBirth: data.dateOfBirth ? new Date(String(data.dateOfBirth)) : null,
      }),
      ...(data.gender !== undefined && { gender: (data.gender as string | null) ?? null }),
      ...(data.relationship !== undefined && { relationship: String(data.relationship) }),
      ...(data.nationalId !== undefined && { nationalId: (data.nationalId as string | null) ?? null }),
      ...(data.passportNumber !== undefined && {
        passportNumber: (data.passportNumber as string | null) ?? null,
      }),
      ...(data.notes !== undefined && { notes: (data.notes as string | null) ?? null }),
    },
  });
}

export async function deleteLeadDependent(leadId: string, dependentId: string) {
  await assertLeadEditable(leadId);
  const existing = await prisma.leadDependent.findFirst({
    where: { id: dependentId, leadId, deletedAt: null },
  });
  if (!existing) throw new Error('Dependent not found');

  return prisma.leadDependent.update({
    where: { id: dependentId },
    data: { deletedAt: new Date() },
  });
}

export async function createLeadCommunication(
  leadId: string,
  data: Record<string, unknown>,
  userId?: string,
) {
  await assertLeadEditable(leadId);
  const communication = await prisma.leadCommunication.create({
    data: {
      leadId,
      channel: String(data.channel),
      direction: data.direction as 'INBOUND' | 'OUTBOUND',
      subject: (data.subject as string | null | undefined) ?? null,
      body: (data.body as string | null | undefined) ?? null,
      occurredAt: new Date(String(data.occurredAt)),
      createdById: userId ?? null,
    },
    include: {
      createdBy: { select: { id: true, firstName: true, lastName: true } },
    },
  });

  await prisma.leadActivity.create({
    data: {
      leadId,
      type: 'COMMUNICATION',
      description: `${communication.direction} ${communication.channel}${communication.subject ? `: ${communication.subject}` : ''}`,
      userId: userId ?? null,
      metadata: { communicationId: communication.id },
    },
  });

  return communication;
}

export async function updateLeadProposal(leadId: string, data: Record<string, unknown>) {
  await assertLeadEditable(leadId);
  return prisma.lead.update({
    where: { id: leadId },
    data: {
      ...(data.proposalStatus !== undefined && {
        proposalStatus: (data.proposalStatus as string | null) ?? null,
      }),
      ...(data.proposalDocumentId !== undefined && {
        proposalDocumentId: (data.proposalDocumentId as string | null) ?? null,
      }),
      ...(data.proposalSentAt !== undefined && {
        proposalSentAt: data.proposalSentAt ? new Date(String(data.proposalSentAt)) : null,
      }),
      ...(data.proposalNotes !== undefined && {
        proposalNotes: (data.proposalNotes as string | null) ?? null,
      }),
    },
  });
}

export async function copyLeadDependentsToClient(
  tx: Prisma.TransactionClient,
  leadId: string,
  clientId: string,
) {
  const dependents = await tx.leadDependent.findMany({
    where: { leadId, deletedAt: null },
  });

  const created = [];
  for (const dependent of dependents) {
    created.push(
      await tx.clientDependent.create({
        data: {
          clientId,
          firstName: dependent.firstName,
          lastName: dependent.lastName,
          dateOfBirth: dependent.dateOfBirth,
          gender: dependent.gender,
          relationship: dependent.relationship,
          nationalId: dependent.nationalId,
          passportNumber: dependent.passportNumber,
          notes: dependent.notes,
        },
      }),
    );
  }
  return created;
}
