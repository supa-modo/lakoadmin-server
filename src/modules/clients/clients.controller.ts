import { Response, NextFunction } from 'express';
import {
  listClients,
  getClientById,
  createClient,
  updateClient,
  softDeleteClient,
  searchClients,
  listClientContacts,
  createClientContact,
  updateClientContact,
  deleteClientContact,
} from './clients.service';
import { sendSuccess, sendCreated, sendError, buildPaginationMeta, sendPaginated } from '../../utils/apiResponse';
import { AuthRequest } from '../../types/express';
import { logAudit } from '../../services/auditService';

export async function getClients(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { clients, total, page, limit } = await listClients(req);
    const pagination = buildPaginationMeta(total, page, limit);
    sendPaginated(res, clients, pagination);
  } catch (err) {
    next(err);
  }
}

export async function getClient(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const client = await getClientById(req.params.id);
    sendSuccess(res, client);
  } catch (err) {
    if ((err as Error).message === 'Client not found') {
      sendError(res, 'Client not found', 404);
    } else {
      next(err);
    }
  }
}

export async function createClientHandler(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const client = await createClient(req.body, req.user?.id);
    logAudit(req, 'CREATE', 'Client', client.id, null, { id: client.id, clientNumber: client.clientNumber });
    sendCreated(res, client, 'Client created successfully');
  } catch (err) {
    next(err);
  }
}

export async function updateClientHandler(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const client = await updateClient(req.params.id, req.body);
    logAudit(req, 'UPDATE', 'Client', client.id, null, req.body);
    sendSuccess(res, client, 'Client updated successfully');
  } catch (err) {
    if ((err as Error).message === 'Client not found') {
      sendError(res, 'Client not found', 404);
    } else {
      next(err);
    }
  }
}

export async function deleteClientHandler(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    await softDeleteClient(req.params.id);
    logAudit(req, 'DELETE', 'Client', req.params.id);
    sendSuccess(res, null, 'Client deleted successfully');
  } catch (err) {
    if ((err as Error).message === 'Client not found') {
      sendError(res, 'Client not found', 404);
    } else if ((err as Error).message === 'Cannot delete client with active policies') {
      sendError(res, 'Cannot delete client with active policies', 400);
    } else {
      next(err);
    }
  }
}

export async function searchClientsHandler(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { q } = req.query;
    if (!q || typeof q !== 'string') {
      sendError(res, 'Search query required', 400);
      return;
    }
    const clients = await searchClients(q);
    sendSuccess(res, clients);
  } catch (err) {
    next(err);
  }
}

// Contact handlers
export async function getClientContacts(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const contacts = await listClientContacts(req.params.id);
    sendSuccess(res, contacts);
  } catch (err) {
    if ((err as Error).message === 'Client not found') {
      sendError(res, 'Client not found', 404);
    } else {
      next(err);
    }
  }
}

export async function createContactHandler(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const contact = await createClientContact(req.params.id, req.body);
    logAudit(req, 'CREATE', 'ClientContact', contact.id, null, { clientId: req.params.id, name: contact.name });
    sendCreated(res, contact, 'Contact created successfully');
  } catch (err) {
    if ((err as Error).message === 'Client not found') {
      sendError(res, 'Client not found', 404);
    } else {
      next(err);
    }
  }
}

export async function updateContactHandler(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const contact = await updateClientContact(req.params.id, req.params.contactId, req.body);
    logAudit(req, 'UPDATE', 'ClientContact', contact.id, null, req.body);
    sendSuccess(res, contact, 'Contact updated successfully');
  } catch (err) {
    if ((err as Error).message === 'Client not found') {
      sendError(res, 'Client not found', 404);
    } else if ((err as Error).message === 'Contact not found') {
      sendError(res, 'Contact not found', 404);
    } else {
      next(err);
    }
  }
}

export async function deleteContactHandler(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    await deleteClientContact(req.params.id, req.params.contactId);
    logAudit(req, 'DELETE', 'ClientContact', req.params.contactId, null, { clientId: req.params.id });
    sendSuccess(res, null, 'Contact deleted successfully');
  } catch (err) {
    if ((err as Error).message === 'Client not found') {
      sendError(res, 'Client not found', 404);
    } else if ((err as Error).message === 'Contact not found') {
      sendError(res, 'Contact not found', 404);
    } else {
      next(err);
    }
  }
}
