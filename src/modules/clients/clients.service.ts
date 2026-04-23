import { prisma } from '../../config/database';
import { AuthRequest } from '../../types/express';
import { Client, ClientContact, Prisma } from '@prisma/client';

interface ListClientsResult {
  clients: Client[];
  total: number;
  page: number;
  limit: number;
}

export async function listClients(req: AuthRequest): Promise<ListClientsResult> {
  const {
    page = 1,
    limit = 20,
    search,
    type,
    relationshipManager,
  } = req.query as {
    page?: number;
    limit?: number;
    search?: string;
    type?: string;
    relationshipManager?: string;
  };

  const where: Prisma.ClientWhereInput = {
    deletedAt: null,
  };

  if (search) {
    where.OR = [
      { clientNumber: { contains: search, mode: 'insensitive' } },
      { firstName: { contains: search, mode: 'insensitive' } },
      { lastName: { contains: search, mode: 'insensitive' } },
      { companyName: { contains: search, mode: 'insensitive' } },
      { email: { contains: search, mode: 'insensitive' } },
      { phone: { contains: search, mode: 'insensitive' } },
      { kraPin: { contains: search, mode: 'insensitive' } },
    ];
  }

  if (type) {
    where.type = type as any;
  }

  if (relationshipManager) {
    where.relationshipManagerId = relationshipManager;
  }

  const skip = (page - 1) * limit;

  const [clients, total] = await Promise.all([
    prisma.client.findMany({
      where,
      include: {
        relationshipManager: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        _count: {
          select: {
            policies: true,
            claims: true,
            contacts: true,
          },
        },
      },
      skip,
      take: limit,
      orderBy: {
        createdAt: 'desc',
      },
    }),
    prisma.client.count({ where }),
  ]);

  return {
    clients,
    total,
    page,
    limit,
  };
}

export async function getClientById(id: string): Promise<Client> {
  const client = await prisma.client.findUnique({
    where: { id },
    include: {
      relationshipManager: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
        },
      },
      contacts: {
        orderBy: {
          isPrimary: 'desc',
        },
      },
      policies: {
        where: {
          deletedAt: null,
        },
        take: 10,
        orderBy: {
          createdAt: 'desc',
        },
      },
      claims: {
        take: 10,
        orderBy: {
          createdAt: 'desc',
        },
      },
      tasks: {
        where: {
          status: {
            not: 'CANCELLED',
          },
        },
        take: 10,
        orderBy: {
          dueDate: 'asc',
        },
      },
      onboardingCases: {
        orderBy: {
          createdAt: 'desc',
        },
      },
    },
  });

  if (!client || client.deletedAt) {
    throw new Error('Client not found');
  }

  return client;
}

export async function createClient(data: any, createdById?: string): Promise<Client> {
  const clientNumber = await generateClientNumber();

  if (data.dateOfBirth) {
    data.dateOfBirth = new Date(data.dateOfBirth);
  }

  if (data.incorporationDate) {
    data.incorporationDate = new Date(data.incorporationDate);
  }

  const client = await prisma.client.create({
    data: {
      ...data,
      clientNumber,
      createdById,
    },
    include: {
      relationshipManager: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
        },
      },
    },
  });

  return client;
}

export async function updateClient(id: string, data: any): Promise<Client> {
  const existing = await prisma.client.findUnique({
    where: { id },
  });

  if (!existing || existing.deletedAt) {
    throw new Error('Client not found');
  }

  if (data.dateOfBirth) {
    data.dateOfBirth = new Date(data.dateOfBirth);
  }

  if (data.incorporationDate) {
    data.incorporationDate = new Date(data.incorporationDate);
  }

  const client = await prisma.client.update({
    where: { id },
    data,
    include: {
      relationshipManager: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
        },
      },
    },
  });

  return client;
}

export async function softDeleteClient(id: string): Promise<void> {
  const existing = await prisma.client.findUnique({
    where: { id },
  });

  if (!existing || existing.deletedAt) {
    throw new Error('Client not found');
  }

  const activePolicies = await prisma.policy.count({
    where: {
      clientId: id,
      status: {
        in: ['ACTIVE', 'PENDING_PAYMENT', 'PENDING_UNDERWRITING'],
      },
      deletedAt: null,
    },
  });

  if (activePolicies > 0) {
    throw new Error('Cannot delete client with active policies');
  }

  await prisma.client.update({
    where: { id },
    data: {
      deletedAt: new Date(),
    },
  });
}

export async function searchClients(search: string): Promise<any[]> {
  const clients = await prisma.client.findMany({
    where: {
      deletedAt: null,
      OR: [
        { clientNumber: { contains: search, mode: 'insensitive' } },
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { companyName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } },
      ],
    },
    take: 20,
    select: {
      id: true,
      clientNumber: true,
      type: true,
      firstName: true,
      lastName: true,
      companyName: true,
      email: true,
      phone: true,
    },
    orderBy: {
      createdAt: 'desc',
    },
  });

  return clients;
}

// Contact management
export async function listClientContacts(clientId: string): Promise<ClientContact[]> {
  const client = await prisma.client.findUnique({
    where: { id: clientId },
  });

  if (!client || client.deletedAt) {
    throw new Error('Client not found');
  }

  const contacts = await prisma.clientContact.findMany({
    where: { clientId },
    orderBy: [{ isPrimary: 'desc' }, { createdAt: 'desc' }],
  });

  return contacts;
}

export async function createClientContact(clientId: string, data: any): Promise<ClientContact> {
  const client = await prisma.client.findUnique({
    where: { id: clientId },
  });

  if (!client || client.deletedAt) {
    throw new Error('Client not found');
  }

  if (data.isPrimary) {
    await prisma.clientContact.updateMany({
      where: { clientId },
      data: { isPrimary: false },
    });
  }

  const contact = await prisma.clientContact.create({
    data: {
      ...data,
      clientId,
    },
  });

  return contact;
}

export async function updateClientContact(clientId: string, contactId: string, data: any): Promise<ClientContact> {
  const contact = await prisma.clientContact.findFirst({
    where: {
      id: contactId,
      clientId,
    },
  });

  if (!contact) {
    throw new Error('Contact not found');
  }

  if (data.isPrimary) {
    await prisma.clientContact.updateMany({
      where: {
        clientId,
        id: { not: contactId },
      },
      data: { isPrimary: false },
    });
  }

  const updatedContact = await prisma.clientContact.update({
    where: { id: contactId },
    data,
  });

  return updatedContact;
}

export async function deleteClientContact(clientId: string, contactId: string): Promise<void> {
  const contact = await prisma.clientContact.findFirst({
    where: {
      id: contactId,
      clientId,
    },
  });

  if (!contact) {
    throw new Error('Contact not found');
  }

  await prisma.clientContact.delete({
    where: { id: contactId },
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
