import { Response, NextFunction } from 'express';
import { AuthRequest } from '../../types/express';
import { sendSuccess, sendCreated, sendError, buildPaginationMeta, sendPaginated } from '../../utils/apiResponse';
import { logAudit } from '../../services/auditService';
import {
  listInsurers,
  getInsurerById,
  createInsurer,
  updateInsurer,
  softDeleteInsurer,
  listContacts,
  addContact,
  updateContact,
  removeContact,
  getInsurerProducts,
  getInsurerCommissionRules,
} from './insurers.service';

export async function getInsurers(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { insurers, total, page, limit } = await listInsurers(req);
    const pagination = buildPaginationMeta(total, page, limit);
    sendPaginated(res, insurers, pagination);
  } catch (err) {
    next(err);
  }
}

export async function getInsurer(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const insurer = await getInsurerById(req.params.id);
    sendSuccess(res, insurer);
  } catch (err) {
    if ((err as Error).message === 'Insurer not found') {
      sendError(res, 'Insurer not found', 404);
    } else {
      next(err);
    }
  }
}

export async function createInsurerHandler(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const insurer = await createInsurer(req.body, req.user?.id);
    logAudit(req, 'CREATE', 'Insurer', insurer.id, null, { id: insurer.id, name: insurer.name });
    sendCreated(res, insurer, 'Insurer created successfully');
  } catch (err) {
    next(err);
  }
}

export async function updateInsurerHandler(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const before = await getInsurerById(req.params.id).catch(() => null);
    const insurer = await updateInsurer(req.params.id, req.body);
    logAudit(req, 'UPDATE', 'Insurer', insurer.id, before, insurer);
    sendSuccess(res, insurer, 'Insurer updated successfully');
  } catch (err) {
    if ((err as Error).message === 'Insurer not found') {
      sendError(res, 'Insurer not found', 404);
    } else {
      next(err);
    }
  }
}

export async function deleteInsurerHandler(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    await softDeleteInsurer(req.params.id);
    logAudit(req, 'DELETE', 'Insurer', req.params.id, null, null);
    sendSuccess(res, null, 'Insurer deleted successfully');
  } catch (err) {
    const msg = (err as Error).message;
    if (msg === 'Insurer not found') {
      sendError(res, msg, 404);
    } else if (msg.includes('active products')) {
      sendError(res, msg, 409);
    } else {
      next(err);
    }
  }
}

// Contacts
export async function getContacts(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const contacts = await listContacts(req.params.id);
    sendSuccess(res, contacts);
  } catch (err) {
    if ((err as Error).message === 'Insurer not found') {
      sendError(res, 'Insurer not found', 404);
    } else {
      next(err);
    }
  }
}

export async function addContactHandler(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const contact = await addContact(req.params.id, req.body);
    logAudit(req, 'CREATE', 'InsurerContact', contact.id, null, contact);
    sendCreated(res, contact, 'Contact added successfully');
  } catch (err) {
    if ((err as Error).message === 'Insurer not found') {
      sendError(res, 'Insurer not found', 404);
    } else {
      next(err);
    }
  }
}

export async function updateContactHandler(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const contact = await updateContact(req.params.id, req.params.contactId, req.body);
    logAudit(req, 'UPDATE', 'InsurerContact', contact.id, null, contact);
    sendSuccess(res, contact, 'Contact updated successfully');
  } catch (err) {
    if ((err as Error).message === 'Contact not found') {
      sendError(res, 'Contact not found', 404);
    } else {
      next(err);
    }
  }
}

export async function deleteContactHandler(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    await removeContact(req.params.id, req.params.contactId);
    logAudit(req, 'DELETE', 'InsurerContact', req.params.contactId, null, null);
    sendSuccess(res, null, 'Contact removed successfully');
  } catch (err) {
    if ((err as Error).message === 'Contact not found') {
      sendError(res, 'Contact not found', 404);
    } else {
      next(err);
    }
  }
}

export async function getInsurerProductsHandler(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const products = await getInsurerProducts(req.params.id);
    sendSuccess(res, products);
  } catch (err) {
    if ((err as Error).message === 'Insurer not found') {
      sendError(res, 'Insurer not found', 404);
    } else {
      next(err);
    }
  }
}

export async function getInsurerCommissionRulesHandler(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const rules = await getInsurerCommissionRules(req.params.id);
    sendSuccess(res, rules);
  } catch (err) {
    if ((err as Error).message === 'Insurer not found') {
      sendError(res, 'Insurer not found', 404);
    } else {
      next(err);
    }
  }
}
