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
  clientType?: string,
  relationshipManagerId?: string,
  userId?: string
): Promise<any> {
  const lead = await prisma.lead.findUnique({
    where: { id },
  });

  if (!lead || lead.deletedAt) {
    throw new Error('Lead not found');
  }

  if (lead.convertedToClientId) {
    throw new Error('Lead has already been converted to a client');
  }

  const clientNumber = await generateClientNumber();

  const client = await prisma.client.create({
    data: {
      clientNumber,
      type: (clientType as any) || lead.leadType,
      firstName: lead.leadType === 'INDIVIDUAL' ? lead.name.split(' ')[0] : null,
      lastName: lead.leadType === 'INDIVIDUAL' ? lead.name.split(' ').slice(1).join(' ') : null,
      companyName: lead.leadType !== 'INDIVIDUAL' ? lead.companyName || lead.name : null,
      email: lead.email,
      phone: lead.phone,
      relationshipManagerId,
      createdById: userId,
    },
  });

  await prisma.lead.update({
    where: { id },
    data: {
      convertedToClientId: client.id,
      convertedAt: new Date(),
      status: 'WON',
    },
  });

  await prisma.leadActivity.create({
    data: {
      leadId: id,
      type: 'CONVERSION',
      description: `Lead converted to client ${client.clientNumber}`,
      userId,
      metadata: {
        clientId: client.id,
        clientNumber: client.clientNumber,
      },
    },
  });

  return { lead, client };
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
